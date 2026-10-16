import 'reflect-metadata';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../src/auth/guards/permissions.guard';
import { RequirePermissions } from '../../../src/auth/decorators/permissions.decorator';
import { BranchScopeService } from '../../../src/common/services/branch-scope.service';
import { RequestContextService } from '../../../src/common/services/request-context.service';
import {
  DEFAULT_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  generateAllPermissions,
} from '../../../prisma/seeds/shared/permissions.seed';

const root = join(__dirname, '../../../src');
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.controller.ts') ? [file] : [];
  });
interface Contract {
  route: string;
  method: string;
  permissions: string[];
}
const contracts: Contract[] = [];
for (const file of files(root)) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const decorators = (node: ts.Node) =>
    ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  const permissions = (node: ts.Node): string[] | undefined => {
    const decorator = decorators(node).find(
      (decorator) =>
        ts.isCallExpression(decorator.expression) &&
        decorator.expression.expression.getText(source) === 'RequirePermissions',
    );
    return decorator && ts.isCallExpression(decorator.expression)
      ? decorator.expression.arguments.filter(ts.isStringLiteral).map((argument) => argument.text)
      : undefined;
  };
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node))
      for (const member of node.members) {
        const http = decorators(member)
          .map((decorator) => decorator.expression)
          .find(
            (expression) =>
              ts.isCallExpression(expression) &&
              /^(Get|Post|Put|Patch|Delete)$/.test(expression.expression.getText(source)),
          );
        const grants = permissions(member) ?? permissions(node);
        if (http && ts.isCallExpression(http) && grants?.length)
          contracts.push({
            route: `${relative(root, file)}:${member.name?.getText(source)}`,
            method: http.expression.getText(source),
            permissions: grants,
          });
      }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Exercise the production permission guard with real metadata and every seeded
// grant set. No HTTP authentication, persistence or outbound services are mocked
// as "passed" here: these are explicitly isolated guard/scope acceptance cases.
describe('all-role action guard acceptance matrix', () => {
  const catalog = generateAllPermissions().map((permission) => permission.name);
  const roles = DEFAULT_ROLES.map(({ name }) => ({
    role: name,
    grants: name === 'super_admin' ? catalog : DEFAULT_PERMISSION_MATRIX[name],
  }));
  const scenarios = roles.flatMap((role) => [false, true].map((hq) => ({ ...role, hq })));
  it('includes the application controller contracts and every built-in role', () => {
    expect(contracts.length).toBeGreaterThan(250);
    expect(roles).toHaveLength(10);
    expect(contracts.filter((contract) => contract.method !== 'Get').length).toBeGreaterThan(140);
  });

  it.each(scenarios)(
    '$role HQ=$hq permits exactly the guarded capabilities it holds',
    async ({ role, grants, hq }) => {
      const fallback = jest.fn(() => {
        throw new Error('Matrix must use the verified profile grant set');
      });
      const guard = new PermissionsGuard(
        new Reflector(),
        { getUserPermissions: fallback } as never,
        { profile: { findUnique: fallback } } as never,
      );
      for (const contract of contracts) {
        class Controller {}
        const descriptor = { value: () => undefined, configurable: true };
        RequirePermissions(...contract.permissions)(Controller.prototype, 'action', descriptor);
        const request = {
          user: { sub: 'isolated-matrix-user' },
          profile: {
            church_id: 'church-a',
            branch_id: 'branch-a',
            role,
            roles: [role],
            is_admin_hq: hq,
            permissions: grants,
          },
        };
        const context = {
          getHandler: () => descriptor.value,
          getClass: () => Controller,
          switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext;
        const allowed = contract.permissions.every((permission) => grants.includes(permission));
        if (allowed) await expect(guard.canActivate(context)).resolves.toBe(true);
        else await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it.each(scenarios)(
    '$role HQ=$hq keeps scope independent of action grants',
    ({ role, grants, hq }) => {
      const context = new RequestContextService();
      const scope = new BranchScopeService(context);
      context.run(
        {
          userId: 'isolated-matrix-user',
          churchId: 'church-a',
          role,
          branchId: 'branch-a',
          viewer: {
            church_id: 'church-a',
            branch_id: 'branch-a',
            role,
            roles: [role],
            permissions: grants,
            is_admin_hq: hq,
          },
        },
        () => {
          expect(scope.isVisible(undefined, 'branch-a')).toBe(true);
          expect(scope.isVisible(undefined, 'branch-b')).toBe(hq);
          expect(context.branchWhere('church-a')).toEqual(hq ? {} : { branch_id: 'branch-a' });
          expect(() => context.branchWhere('church-b')).toThrow(ForbiddenException);
        },
      );
    },
  );

  it('keeps read-only custom grants from satisfying mutation requirements, including for HQ', async () => {
    const readOnly = catalog.filter((permission) => /:(read|view)$/.test(permission));
    const guard = new PermissionsGuard(new Reflector(), {} as never, {} as never);
    for (const contract of contracts.filter((contract) =>
      contract.permissions.some((permission) => /:(create|update|delete)$/.test(permission)),
    )) {
      class Controller {}
      const descriptor = { value: () => undefined, configurable: true };
      RequirePermissions(...contract.permissions)(Controller.prototype, 'action', descriptor);
      const request = {
        user: { sub: 'readonly' },
        profile: {
          church_id: 'church-a',
          role: 'custom_readonly',
          is_admin_hq: true,
          permissions: readOnly,
        },
      };
      const context = {
        getHandler: () => descriptor.value,
        getClass: () => Controller,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
