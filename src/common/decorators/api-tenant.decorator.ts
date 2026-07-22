import { ApiQuery } from '@nestjs/swagger';

export function ApiChurchId() {
  return ApiQuery({ name: 'churchId', required: true, description: 'Church ID (UUID)' });
}

export function ApiBranchId() {
  return ApiQuery({
    name: 'branchId',
    required: false,
    description: 'Branch ID (UUID), filters by branch',
  });
}
