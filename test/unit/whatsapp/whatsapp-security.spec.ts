import { Reflector } from '@nestjs/core';
import { WhatsAppController } from '../../../src/whatsapp/whatsapp.controller';
import { CustomFieldsController } from '../../../src/custom-fields/custom-fields.controller';
import { PERMISSIONS_KEY } from '../../../src/auth/decorators/permissions.decorator';

describe('Messaging and field definition authorization', () => {
  const reflector = new Reflector();
  it.each(['sendMessage', 'sendTemplateMessage'] as const)(
    'requires sending permission for %s',
    (method) => {
      expect(reflector.get(PERMISSIONS_KEY, WhatsAppController.prototype[method])).toEqual([
        'whatsapp:create',
      ]);
    },
  );

  it('requires read permission for message history', () => {
    expect(reflector.get(PERMISSIONS_KEY, WhatsAppController.prototype.listMessages)).toEqual([
      'whatsapp:read',
    ]);
  });

  it.each(['create', 'update', 'remove', 'archive', 'restore'] as const)(
    'protects custom field %s',
    (method) => {
      expect(reflector.get(PERMISSIONS_KEY, CustomFieldsController.prototype[method])).toEqual([
        'church_settings:update',
      ]);
    },
  );
});
