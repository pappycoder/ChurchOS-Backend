import type { AuthenticatedRequest } from '../common/decorators/current-user.decorator';
export type StaffProfile = NonNullable<AuthenticatedRequest['profile']>;
export interface AssistantAccess {
  label: string;
  status:
    | 'available'
    | 'missing_permission'
    | 'plan_required'
    | 'admin_required'
    | 'subscription_required';
  detail: string;
}
export interface AssistantSource {
  id: string;
  title: string;
  path?: string;
  text: string;
}
export interface AssistantLink {
  title: string;
  path: string;
  trail: string;
}
export interface AssistantReply {
  answer: string;
  mode: 'ai' | 'guides';
  notice?: string;
  sources: Omit<AssistantSource, 'text'>[];
  navigation: AssistantLink[];
  access: AssistantAccess[];
  knowledgeVersion: string;
}
