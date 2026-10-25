import { PickType } from '@nestjs/mapped-types';
import { CreateVisitorDto } from './create-visitor.dto';

/** Import only fields exposed by the visitor template; workflow state stays server-owned. */
export class ImportVisitorDto extends PickType(CreateVisitorDto, [
  'firstName',
  'lastName',
  'gender',
  'phone',
  'whatsappNumber',
  'email',
  'firstVisitDate',
  'branchId',
  'notes',
] as const) {}
