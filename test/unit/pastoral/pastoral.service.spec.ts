import { Test, TestingModule } from '@nestjs/testing';
import { PastoralService } from '../../../src/pastoral/pastoral.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { AuditLoggingService } from '../../../src/common/services/audit-logging.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('PastoralService', () => {
  let service: PastoralService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditLog: jest.Mock;

  const mockChurchId = 'church-1';
  const mockUserId = 'user-1';
  const mockMemberId = 'member-1';

  const mockNote = {
    id: 'note-1',
    church_id: mockChurchId,
    member_id: mockMemberId,
    author_id: mockUserId,
    content: 'encrypted-content',
    confidentiality: 'standard',
    tags: ['prayer'],
    created_at: new Date('2024-06-01'),
    updated_at: new Date('2024-06-01'),
    member: { first_name: 'John', last_name: 'Doe' },
    author: { first_name: 'Pastor', last_name: 'Smith' },
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditLog = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLoggingService, useValue: { log: auditLog } },
      ],
    }).compile();

    service = module.get<PastoralService>(PastoralService);
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt content correctly', () => {
      const plaintext = 'This is a confidential pastoral note';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext
    });

    it('should handle empty strings gracefully', () => {
      const encrypted = service.encrypt('');
      const decrypted = service.decrypt(encrypted);
      expect(typeof decrypted).toBe('string');
    });

    it('should handle long content', () => {
      const plaintext = 'A'.repeat(5000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail gracefully on tampered data', () => {
      const encrypted = service.encrypt('test');
      const parts = encrypted.split(':');
      parts[2] = 'tampered';
      const result = service.decrypt(parts.join(':'));
      expect(result).toBe('[Decryption failed]');
    });

    it('should fail gracefully on invalid format', () => {
      const result = service.decrypt('invalid');
      expect(result).toBe('[Decryption failed: invalid format]');
    });
  });

  describe('createNote', () => {
    it('should create a pastoral note with encrypted content', async () => {
      prisma.pastoralNote.create.mockResolvedValue(mockNote);

      const result = await service.createNote(
        { memberId: mockMemberId, content: 'Test content', tags: ['prayer'] },
        mockChurchId,
        mockUserId,
      );

      expect(result.id).toBe('note-1');
      expect(result.memberId).toBe(mockMemberId);
      expect(result.content).toBe('Test content');
      expect(result.tags).toEqual(['prayer']);
      expect(prisma.pastoralNote.create).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalled();
    });

    it('should set default confidentiality to standard', async () => {
      prisma.pastoralNote.create.mockResolvedValue({
        ...mockNote,
        confidentiality: 'standard',
      });

      await service.createNote(
        { memberId: mockMemberId, content: 'Test' },
        mockChurchId,
        mockUserId,
      );

      const createCall = prisma.pastoralNote.create.mock.calls[0][0];
      expect(createCall.data.confidentiality).toBe('standard');
    });
  });

  describe('getNoteById', () => {
    it('should return a note with decrypted content', async () => {
      const plaintext = 'Test pastoral note content';
      const noteWithEncrypted = {
        ...mockNote,
        content: service.encrypt(plaintext),
      };
      prisma.pastoralNote.findFirst.mockResolvedValue(noteWithEncrypted);

      const result = await service.getNoteById('note-1', mockChurchId, 'branch_pastor', mockUserId);

      expect(result.content).toBe(plaintext);
    });

    it('should throw NotFoundException for non-existent note', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue(null);

      await expect(
        service.getNoteById('non-existent', mockChurchId, 'branch_pastor', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for restricted notes (non-admin)', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        confidentiality: 'restricted',
        author_id: 'other-user',
      });

      await expect(
        service.getNoteById('note-1', mockChurchId, 'branch_pastor', mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to access restricted notes', async () => {
      const plaintext = 'Restricted content';
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        content: service.encrypt(plaintext),
        confidentiality: 'restricted',
        author_id: 'other-user',
      });

      const result = await service.getNoteById('note-1', mockChurchId, 'church_admin', mockUserId);
      expect(result.content).toBe(plaintext);
    });

    it('should allow author to access their own restricted notes', async () => {
      const plaintext = 'My restricted note';
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        content: service.encrypt(plaintext),
        confidentiality: 'restricted',
        author_id: mockUserId,
      });

      const result = await service.getNoteById('note-1', mockChurchId, 'branch_pastor', mockUserId);
      expect(result.content).toBe(plaintext);
    });
  });

  describe('updateNote', () => {
    it('should update note content (author)', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue(mockNote);
      prisma.pastoralNote.update.mockResolvedValue({
        ...mockNote,
        content: service.encrypt('Updated content'),
      });

      const result = await service.updateNote(
        'note-1',
        { content: 'Updated content' },
        mockChurchId,
        mockUserId,
        'branch_pastor',
      );

      expect(result.content).toBe('Updated content');
      expect(auditLog).toHaveBeenCalled();
    });

    it('should allow admin to update any note', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        author_id: 'other-user',
      });
      prisma.pastoralNote.update.mockResolvedValue(mockNote);

      await expect(
        service.updateNote(
          'note-1',
          { content: 'Admin update' },
          mockChurchId,
          mockUserId,
          'church_admin',
        ),
      ).resolves.toBeDefined();
    });

    it('should throw ForbiddenException for non-author/non-admin', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        author_id: 'other-user',
      });

      await expect(
        service.updateNote(
          'note-1',
          { content: 'Unauthorized update' },
          mockChurchId,
          mockUserId,
          'branch_pastor',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note (author)', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue(mockNote);
      prisma.pastoralNote.delete.mockResolvedValue(mockNote);

      await service.deleteNote('note-1', mockChurchId, mockUserId, 'branch_pastor');

      expect(prisma.pastoralNote.delete).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for restricted notes (non-admin)', async () => {
      prisma.pastoralNote.findFirst.mockResolvedValue({
        ...mockNote,
        confidentiality: 'restricted',
      });

      await expect(
        service.deleteNote('note-1', mockChurchId, mockUserId, 'branch_pastor'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listNotes', () => {
    it('should return paginated notes', async () => {
      prisma.pastoralNote.findMany.mockResolvedValue([mockNote]);
      prisma.pastoralNote.count.mockResolvedValue(1);

      const result = await service.listNotes(
        { page: 1, limit: 10 },
        mockChurchId,
        'branch_pastor',
        mockUserId,
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
