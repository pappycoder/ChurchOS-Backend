import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { churchEntitlements } from '../billing/entitlements';
import { AssistantProvider } from './assistant.provider';
import { AssistantBudget, requestLimit } from './assistant.budget';
import {
  actionAccess,
  KNOWLEDGE_VERSION,
  normalizedPage,
  pageSummary,
  retrieve,
  routeAccess,
} from './assistant.knowledge';
import type { AccessContext } from './assistant.knowledge';
import type { AssistantReply, StaffProfile } from './assistant.types';
import type { AssistantQuestionDto } from './assistant.dto';

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AssistantProvider,
    private readonly budget: AssistantBudget,
  ) {}
  private async verified(profile?: StaffProfile): Promise<AccessContext> {
    if (
      !profile ||
      profile.status !== 'active' ||
      !profile.roles?.length ||
      profile.profile_archived_at ||
      profile.church_archived_at ||
      !profile.church_id ||
      !Array.isArray(profile.permissions)
    )
      throw new ForbiddenException('An active verified staff profile is required.');
    const entitlement = await churchEntitlements(this.prisma, profile.church_id);
    return {
      profile,
      features: entitlement.features,
      plan: entitlement.plan,
      subscriptionActive: entitlement.active,
    };
  }
  async context(profile?: StaffProfile) {
    const context = await this.verified(profile);
    return {
      mode: this.provider.configured && context.subscriptionActive ? 'ai' : 'guides',
      knowledgeVersion: KNOWLEDGE_VERSION,
      scope: {
        roles: context.profile.roles,
        location: context.profile.is_admin_hq
          ? 'All authorized branches'
          : context.profile.branch_id
            ? 'Your assigned branch'
            : 'No branch assigned',
        plan: context.plan,
        subscriptionActive: context.subscriptionActive,
      },
      limits: {
        churchDailyQuestions: requestLimit(context.plan),
        userDailyQuestions: 30,
        resetTimezone: 'Africa/Lagos',
      },
    };
  }
  async ask(dto: AssistantQuestionDto, profile?: StaffProfile): Promise<AssistantReply> {
    const question = dto.question.trim();
    if (question.length < 3)
      throw new BadRequestException('Please enter a question with at least three characters.');
    const context = await this.verified(profile);
    const page = normalizedPage(dto.page);
    const history = (dto.history ?? []).slice(-3);
    const found = retrieve(question, page, history);
    const current = pageSummary(page);
    const routes = [
      ...new Map(
        [
          ...found.routes,
          ...(/this page|this screen|my access/i.test(question) ? [current] : []),
        ].map((item) => [item.path, item]),
      ).values(),
    ];
    const access = [
      ...routes.map((item) => routeAccess(item.path, context)),
      ...actionAccess(question, page, context),
    ];
    const navigation = routes
      .filter(
        (item) =>
          !item.path.includes('[') && routeAccess(item.path, context).status === 'available',
      )
      .slice(0, 4);
    const permissionsQuestion =
      /permission|access|role|admin|hq|cannot|can['’]t|allowed|denied|^(?:can i|am i|do i have)|why.*(?:see|approve|reject|edit)|[a-z_]+:[a-z_-]+/i.test(
        question,
      );
    const sources = found.sources.slice(0, 5);
    const guideText = sources
      .slice(0, 2)
      .map((source) => `${source.title}\n${source.text.slice(0, 1900)}`)
      .join('\n\n');
    const pageIntro = /explain this page|this screen|where am i/i.test(question)
      ? `You are on ${current.trail}. ${routeAccess(page, context).detail}\n\n`
      : '';
    const fallback =
      permissionsQuestion && access.length
        ? `Here is what your current ChurchOS access confirms:\n\n${access.map((item) => `${item.label}: ${item.detail}`).join('\n\n')}\n\n${context.profile.is_admin_hq ? 'HQ extends branch scope within your permissions; it does not grant every action.' : 'Your access remains within your assigned scope.'} I cannot verify individual record states or leadership assignments. Your church administrator can review those.`
        : pageIntro +
          (guideText ||
            'I could not find a reliable ChurchOS reference for that question. Ask about a ChurchOS feature, navigation or access, or open the Help Centre. I cannot inspect church records or perform actions.');
    const ownOverview =
      /my permissions|my roles|what (?:access|permissions) do i have|list (?:all )?my (?:access|permissions)/i.test(
        question,
      );
    const granted = [...new Set(context.profile.permissions ?? [])].sort();
    const summaries = [...new Set(granted.map((code) => code.split(':')[0]))].map(
      (resource) =>
        `${resource}: ${granted.filter((code) => code.startsWith(`${resource}:`)).length} grants`,
    );
    const overview = `Your verified staff roles: ${(context.profile.roles ?? []).join(', ')}.\nScope: ${context.profile.is_admin_hq ? 'HQ across authorized branches' : context.profile.branch_id ? 'your assigned branch' : 'no branch assigned'}. HQ does not grant every action.\nChurch plan: ${context.plan}; subscription ${context.subscriptionActive ? 'active' : 'inactive'}.\n\nYou hold ${granted.length} effective permission grants across ${summaries.length} resources:\n${summaries.join('\n') || 'No effective grants were resolved.'}\n\nAsk about a specific feature or permission code for its exact checks. Feature eligibility, record ownership, branch scope and state still apply; a permission count does not prove unrestricted access.`;
    const base: AssistantReply = {
      answer: ownOverview ? overview : fallback,
      mode: 'guides',
      sources: sources.map(({ id, title, path }) => ({ id, title, path })),
      navigation,
      access,
      knowledgeVersion: KNOWLEDGE_VERSION,
    };
    // Deterministic access answers cannot be overridden by model or user instructions.
    if (
      permissionsQuestion ||
      !sources.length ||
      !this.provider.configured ||
      !context.subscriptionActive
    )
      return base;
    // Server-added context omits identity IDs, names, email, full permission lists and records.
    // Questions/history remain user-supplied text, as disclosed in the panel.
    const verifiedFacts = {
      page: current,
      plan: context.plan,
      subscriptionActive: context.subscriptionActive,
      branchScope: context.profile.is_admin_hq ? 'authorized HQ scope' : 'assigned branch only',
      access,
    };
    const body = this.provider.request(
      question,
      history,
      verifiedFacts,
      sources.map((source) => ({ ...source, text: source.text.slice(0, 4500) })),
    );
    const reserved = await this.budget.reserve(
      context.profile.church_id,
      context.profile.id,
      context.plan,
      this.provider.reserveCost(body),
    );
    if (!reserved)
      return {
        ...base,
        notice:
          'AI guidance is unavailable or its daily allowance has been reached. Showing ChurchOS references instead.',
      };
    try {
      const answer = await this.provider.answer(body, sources);
      return {
        ...base,
        mode: 'ai',
        answer: answer.answer,
        sources: base.sources.filter((source) => answer.sourceIds.includes(source.id)),
      };
    } catch {
      return {
        ...base,
        notice: 'AI guidance is temporarily unavailable. Showing ChurchOS references instead.',
      };
    }
  }
}
