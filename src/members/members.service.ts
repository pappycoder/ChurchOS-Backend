/**
 * @file members.service.ts
 * @description Business logic for church member management.
 *
 * Handles CRUD operations, search, pagination, and audit logging
 * for the Members module. All queries are scoped by church_id for
 * multi-tenant data isolation.
 *
 * @module members/members.service
 * @since 1.0.0
 */

import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLoggingService } from '../common/services/audit-logging.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { ListMembersDto } from './dto/list-members.dto';
import { MemberResponseDto } from './dto/member-response.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLoggingService,
  ) {}

  /**
   * Creates a new church member.
   *
   * @param dto - Member creation data
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user creating the member (for audit)
   * @returns Created member
   * @throws ConflictException if phone number already exists in the church
   */
  async createMember(
    dto: CreateMemberDto,
    churchId: string,
    userId: string,
  ): Promise<MemberResponseDto> {
    // Check for duplicate phone number within the same church
    if (dto.phone) {
      const existing = await this.prisma.member.findFirst({
        where: {
          church_id: churchId,
          phone: dto.phone,
        },
      });

      if (existing) {
        throw new ConflictException(
          'A member with this phone number already exists in your church',
        );
      }
    }

    const member = await this.prisma.member.create({
      data: {
        church_id: churchId,
        branch_id: dto.branchId || null,
        first_name: dto.firstName,
        last_name: dto.lastName,
        email: dto.email || null,
        phone: dto.phone || null,
        whatsapp_number: dto.whatsappNumber || null,
        date_of_birth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender || null,
        address: dto.address || null,
        city: dto.city || null,
        state: dto.state || null,
        custom_fields: (dto.customFields as Prisma.InputJsonValue) || Prisma.JsonNull,
        notes: dto.notes || null,
      },
    });

    // Audit-log the creation
    await this.audit.log({
      userId,
      churchId,
      entity: 'member',
      action: 'CREATE',
      entityId: member.id,
      newValues: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
    });

    this.logger.log(`Member created: ${member.first_name} ${member.last_name} (${member.id})`);

    return this.mapToResponseDto(member);
  }

  /**
   * Retrieves a single member by ID, scoped to the church.
   *
   * @param id - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Member details
   * @throws NotFoundException if member not found or belongs to another church
   */
  async getMemberById(id: string, churchId: string): Promise<MemberResponseDto> {
    const member = await this.prisma.member.findUnique({
      where: { id },
    });

    if (!member || member.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    return this.mapToResponseDto(member);
  }

  /**
   * Lists members with pagination, search, and filters.
   *
   * @param churchId - Church ID for tenant scoping
   * @param query - List query parameters
   * @returns Paginated list of members
   */
  async listMembers(
    churchId: string,
    query: ListMembersDto,
  ): Promise<{ data: MemberResponseDto[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MemberWhereInput = {
      church_id: churchId,
    };

    // Apply status filter
    if (query.status) {
      where.status = query.status;
    }

    // Apply branch filter
    if (query.branchId) {
      where.branch_id = query.branchId;
    }

    // Apply search filter (name, email, phone)
    if (query.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { first_name: { contains: searchTerm, mode: 'insensitive' } },
        { last_name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Determine sort order
    const orderBy: Prisma.MemberOrderByWithRelationInput[] = [];
    if (query.sortBy) {
      orderBy.push({ [query.sortBy]: (query.sortOrder || 'asc') as Prisma.SortOrder });
    } else {
      orderBy.push({ created_at: 'desc' });
    }

    const [members, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      data: members.map((m) => this.mapToResponseDto(m)),
      total,
    };
  }

  /**
   * Updates a member's details (partial update).
   *
   * @param id - Member UUID
   * @param dto - Update data (only provided fields)
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user updating the member (for audit)
   * @returns Updated member
   * @throws NotFoundException if member not found
   * @throws ConflictException if phone number already exists
   */
  async updateMember(
    id: string,
    dto: UpdateMemberDto,
    churchId: string,
    userId: string,
  ): Promise<MemberResponseDto> {
    // Verify member exists and belongs to this church
    const existing = await this.prisma.member.findUnique({
      where: { id },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    // Check for duplicate phone number if phone is being updated
    if (dto.phone && dto.phone !== existing.phone) {
      const duplicatePhone = await this.prisma.member.findFirst({
        where: {
          church_id: churchId,
          phone: dto.phone,
          id: { not: id },
        },
      });

      if (duplicatePhone) {
        throw new ConflictException(
          'A member with this phone number already exists in your church',
        );
      }
    }

    // Build update data (only include provided fields)
    const updateData: Prisma.MemberUpdateInput = {};

    if (dto.firstName !== undefined) updateData.first_name = dto.firstName;
    if (dto.lastName !== undefined) updateData.last_name = dto.lastName;
    if (dto.email !== undefined) updateData.email = dto.email || null;
    if (dto.phone !== undefined) updateData.phone = dto.phone || null;
    if (dto.whatsappNumber !== undefined) updateData.whatsapp_number = dto.whatsappNumber || null;
    if (dto.dateOfBirth !== undefined)
      updateData.date_of_birth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.gender !== undefined) updateData.gender = dto.gender || null;
    if (dto.address !== undefined) updateData.address = dto.address || null;
    if (dto.city !== undefined) updateData.city = dto.city || null;
    if (dto.state !== undefined) updateData.state = dto.state || null;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.branchId !== undefined) updateData.branch = { connect: { id: dto.branchId } };
    if (dto.photoUrl !== undefined) updateData.photo_url = dto.photoUrl || null;
    if (dto.customFields !== undefined)
      updateData.custom_fields = (dto.customFields as Prisma.InputJsonValue) || Prisma.JsonNull;
    if (dto.notes !== undefined) updateData.notes = dto.notes || null;

    // Skip if nothing to update
    if (Object.keys(updateData).length === 0) {
      return this.mapToResponseDto(existing);
    }

    const member = await this.prisma.member.update({
      where: { id },
      data: updateData,
    });

    // Audit-log the update
    await this.audit.log({
      userId,
      churchId,
      entity: 'member',
      action: 'UPDATE',
      entityId: id,
      oldValues: {
        firstName: existing.first_name,
        lastName: existing.last_name,
        email: existing.email,
        phone: existing.phone,
        status: existing.status,
      },
      newValues: updateData,
    });

    this.logger.log(`Member updated: ${id}`);

    return this.mapToResponseDto(member);
  }

  /**
   * Soft-deletes a member by setting their status to inactive.
   *
   * @param id - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the deletion (for audit)
   * @throws NotFoundException if member not found
   */
  async softDeleteMember(id: string, churchId: string, userId: string): Promise<void> {
    const existing = await this.prisma.member.findUnique({
      where: { id },
    });

    if (!existing || existing.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    await this.prisma.member.update({
      where: { id },
      data: { status: 'inactive' },
    });

    // Audit-log the soft delete
    await this.audit.log({
      userId,
      churchId,
      entity: 'member',
      action: 'DELETE',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: 'inactive' },
    });

    this.logger.log(`Member soft-deleted: ${id}`);
  }

  /**
   * Performs full-text search on members using PostgreSQL.
   *
   * Falls back to ILIKE search for simplicity and portability.
   * Matches against first_name, last_name, email, and phone.
   *
   * @param churchId - Church ID for tenant scoping
   * @param searchTerm - Search term
   * @param limit - Max results (default 20)
   * @returns Matching members
   */
  async searchMembers(
    churchId: string,
    searchTerm: string,
    limit = 20,
  ): Promise<MemberResponseDto[]> {
    const term = searchTerm.trim();

    if (!term) {
      return [];
    }

    const members = await this.prisma.member.findMany({
      where: {
        church_id: churchId,
        OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { created_at: 'desc' },
    });

    return members.map((m) => this.mapToResponseDto(m));
  }

  /**
   * Bulk imports members from a CSV/JSON array.
   *
   * Validates each record, skips duplicates, and reports errors.
   *
   * @param records - Array of member data objects
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user performing the import (for audit)
   * @returns Import results with created count, errors, and dry-run flag
   */
  async bulkImportMembers(
    records: CreateMemberDto[],
    churchId: string,
    userId: string,
    dryRun = false,
  ): Promise<{
    created: number;
    errors: Array<{ row: number; message: string }>;
    dryRun: boolean;
  }> {
    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNum = i + 1;

      try {
        // Validate required fields
        if (!record.firstName || !record.lastName) {
          errors.push({ row: rowNum, message: 'First name and last name are required' });
          continue;
        }

        // Check for duplicate phone
        if (record.phone) {
          const existing = await this.prisma.member.findFirst({
            where: {
              church_id: churchId,
              phone: record.phone,
            },
          });

          if (existing) {
            errors.push({ row: rowNum, message: `Phone ${record.phone} already exists` });
            continue;
          }
        }

        // Check for duplicate email
        if (record.email) {
          const existingEmail = await this.prisma.member.findFirst({
            where: {
              church_id: churchId,
              email: record.email,
            },
          });

          if (existingEmail) {
            errors.push({ row: rowNum, message: `Email ${record.email} already exists` });
            continue;
          }
        }

        if (!dryRun) {
          await this.prisma.member.create({
            data: {
              church_id: churchId,
              branch_id: record.branchId || null,
              first_name: record.firstName,
              last_name: record.lastName,
              email: record.email || null,
              phone: record.phone || null,
              whatsapp_number: record.whatsappNumber || null,
              date_of_birth: record.dateOfBirth ? new Date(record.dateOfBirth) : null,
              gender: record.gender || null,
              address: record.address || null,
              city: record.city || null,
              state: record.state || null,
              custom_fields: (record.customFields as Prisma.InputJsonValue) || Prisma.JsonNull,
              notes: record.notes || null,
            },
          });
        }

        created++;
      } catch (error) {
        errors.push({
          row: rowNum,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Audit-log the import
    if (!dryRun && created > 0) {
      await this.audit.log({
        userId,
        churchId,
        entity: 'member',
        action: 'CREATE',
        entityId: 'bulk-import',
        newValues: { importedCount: created, errorCount: errors.length },
      });
    }

    this.logger.log(
      `Bulk import ${dryRun ? '(dry run) ' : ''}completed: ${created} created, ${errors.length} errors`,
    );

    return { created, errors, dryRun };
  }

  /**
   * Exports members as CSV data.
   *
   * @param churchId - Church ID for tenant scoping
   * @param status - Optional status filter
   * @param branchId - Optional branch filter
   * @returns CSV string
   */
  async exportMembersCsv(churchId: string, status?: string, branchId?: string): Promise<string> {
    const where: Prisma.MemberWhereInput = { church_id: churchId };

    if (status) {
      where.status = status as 'active' | 'inactive' | 'suspended' | 'transferred';
    }

    if (branchId) {
      where.branch_id = branchId;
    }

    const members = await this.prisma.member.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        whatsapp_number: true,
        date_of_birth: true,
        gender: true,
        address: true,
        city: true,
        state: true,
        status: true,
        member_since: true,
        notes: true,
        created_at: true,
      },
    });

    // CSV header
    const headers = [
      'ID',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'WhatsApp Number',
      'Date of Birth',
      'Gender',
      'Address',
      'City',
      'State',
      'Status',
      'Member Since',
      'Notes',
      'Created At',
    ];

    const rows = members.map((m) => [
      m.id,
      m.first_name,
      m.last_name,
      m.email || '',
      m.phone || '',
      m.whatsapp_number || '',
      m.date_of_birth?.toISOString().split('T')[0] || '',
      m.gender || '',
      m.address || '',
      m.city || '',
      m.state || '',
      m.status,
      m.member_since.toISOString().split('T')[0],
      m.notes || '',
      m.created_at.toISOString(),
    ]);

    // Escape CSV values (handle commas, quotes, newlines)
    const escapeCsv = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvLines = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))];

    this.logger.log(`Exported ${members.length} members as CSV`);

    return csvLines.join('\n');
  }

  /**
   * Exports members as XLSX buffer.
   *
   * @param churchId - Church ID for tenant scoping
   * @param status - Optional status filter
   * @param branchId - Optional branch filter
   * @returns XLSX buffer
   */
  async exportMembersXlsx(churchId: string, status?: string, branchId?: string): Promise<Buffer> {
    const ExcelJS = await import('exceljs');

    const where: Prisma.MemberWhereInput = { church_id: churchId };

    if (status) {
      where.status = status as 'active' | 'inactive' | 'suspended' | 'transferred';
    }

    if (branchId) {
      where.branch_id = branchId;
    }

    const members = await this.prisma.member.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        whatsapp_number: true,
        date_of_birth: true,
        gender: true,
        address: true,
        city: true,
        state: true,
        status: true,
        member_since: true,
        notes: true,
        created_at: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ChurchOS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Members', {
      properties: { defaultColWidth: 18 },
    });

    // Add headers
    sheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'First Name', key: 'firstName', width: 15 },
      { header: 'Last Name', key: 'lastName', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'WhatsApp Number', key: 'whatsappNumber', width: 18 },
      { header: 'Date of Birth', key: 'dateOfBirth', width: 14 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Member Since', key: 'memberSince', width: 14 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' }, // Dark blue
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add data rows
    members.forEach((m) => {
      sheet.addRow({
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        email: m.email || '',
        phone: m.phone || '',
        whatsappNumber: m.whatsapp_number || '',
        dateOfBirth: m.date_of_birth?.toISOString().split('T')[0] || '',
        gender: m.gender || '',
        address: m.address || '',
        city: m.city || '',
        state: m.state || '',
        status: m.status,
        memberSince: m.member_since.toISOString().split('T')[0],
        notes: m.notes || '',
        createdAt: m.created_at.toISOString(),
      });
    });

    // Auto-filter
    sheet.autoFilter = {
      from: 'A1',
      to: `O${members.length + 1}`,
    };

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();

    this.logger.log(`Exported ${members.length} members as XLSX`);

    return Buffer.from(buffer);
  }

  /**
   * Generates a QR code data string for a member.
   *
   * The QR code encodes the member ID for check-in scanning.
   *
   * @param id - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @returns QR code data string
   * @throws NotFoundException if member not found
   */
  async generateMemberQRCode(
    id: string,
    churchId: string,
  ): Promise<{ qrData: string; memberId: string }> {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, church_id: true },
    });

    if (!member || member.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    // QR data format: CHURCHOS:MEMBER:<id>
    const qrData = `CHURCHOS:MEMBER:${member.id}`;

    return { qrData, memberId: member.id };
  }

  /**
   * Retrieves giving history for a member.
   *
   * @param id - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Array of giving transactions
   * @throws NotFoundException if member not found
   */
  async getMemberGivingHistory(
    id: string,
    churchId: string,
  ): Promise<
    Array<{
      id: string;
      amount: number;
      currency: string;
      categoryId: string;
      status: string;
      createdAt: string;
    }>
  > {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, church_id: true },
    });

    if (!member || member.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { member_id: id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        category_id: true,
        status: true,
        created_at: true,
      },
    });

    return transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      currency: t.currency,
      categoryId: t.category_id ?? '',
      status: t.status,
      createdAt: t.created_at.toISOString(),
    }));
  }

  /**
   * Retrieves attendance history for a member.
   *
   * @param id - Member UUID
   * @param churchId - Church ID for tenant scoping
   * @returns Array of attendance records
   * @throws NotFoundException if member not found
   */
  async getMemberAttendanceHistory(
    id: string,
    churchId: string,
  ): Promise<
    Array<{
      id: string;
      checkInAt: string;
      serviceName: string;
      source: string;
      createdAt: string;
    }>
  > {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, church_id: true },
    });

    if (!member || member.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    const attendance = await this.prisma.attendance.findMany({
      where: { member_id: id },
      orderBy: { checkin_at: 'desc' },
      include: {
        service: {
          select: {
            name: true,
          },
        },
      },
    });

    return attendance.map((a) => ({
      id: a.id,
      checkInAt: a.checkin_at.toISOString(),
      serviceName: a.service?.name || 'Unknown Service',
      source: a.source,
      createdAt: a.created_at.toISOString(),
    }));
  }

  /**
   * Adds an admin note to a member.
   *
   * @param id - Member UUID
   * @param note - Note content
   * @param churchId - Church ID for tenant scoping
   * @param userId - ID of the user adding the note (for audit)
   * @throws NotFoundException if member not found
   */
  async addMemberNote(
    id: string,
    note: string,
    churchId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { id: true, church_id: true, notes: true },
    });

    if (!member || member.church_id !== churchId) {
      throw new NotFoundException('Member not found');
    }

    // Append note with timestamp
    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}] ${note}`;
    const updatedNotes = member.notes ? `${member.notes}\n${newNote}` : newNote;

    await this.prisma.member.update({
      where: { id },
      data: { notes: updatedNotes },
    });

    // Audit-log the note addition
    await this.audit.log({
      userId,
      churchId,
      entity: 'member',
      action: 'UPDATE',
      entityId: id,
      newValues: { action: 'note_added', note },
    });

    this.logger.log(`Note added to member ${id}`);

    return { success: true };
  }

  /**
   * Maps a Prisma Member record to a response DTO.
   *
   * @param member - Raw Prisma member record
   * @returns Formatted MemberResponseDto
   */
  private mapToResponseDto(member: {
    id: string;
    church_id: string;
    branch_id: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    whatsapp_number: string | null;
    date_of_birth: Date | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    status: string;
    member_since: Date;
    photo_url: string | null;
    custom_fields: Prisma.JsonValue;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  }): MemberResponseDto {
    return {
      memberId: member.id,
      churchId: member.church_id,
      branchId: member.branch_id || undefined,
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email || undefined,
      phone: member.phone || undefined,
      whatsappNumber: member.whatsapp_number || undefined,
      dateOfBirth: member.date_of_birth?.toISOString() || undefined,
      gender: member.gender || undefined,
      address: member.address || undefined,
      city: member.city || undefined,
      state: member.state || undefined,
      status: member.status,
      memberSince: member.member_since.toISOString(),
      photoUrl: member.photo_url || undefined,
      customFields:
        member.custom_fields && typeof member.custom_fields === 'object'
          ? (member.custom_fields as Record<string, unknown>)
          : undefined,
      notes: member.notes || undefined,
      createdAt: member.created_at.toISOString(),
      updatedAt: member.updated_at.toISOString(),
    };
  }
}
