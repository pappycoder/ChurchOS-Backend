/**
 * @file index.ts
 * @description Barrel exports for the Admin module.
 *
 * @module admin
 * @since 1.0.0
 */

// Step 1: Re-export the AdminModule for module registration
export { AdminModule } from './admin.module';
// Step 2: Re-export the AdminService for use by other modules
export { AdminService } from './admin.service';
// Step 3: Re-export department-related DTOs (creation and member management)
export { CreateDepartmentDto, AddDepartmentMemberDto } from './dto/create-department.dto';
// Step 4: Re-export cell group-related DTOs (creation and nearest-group query)
export { CreateCellGroupDto, FindNearestGroupDto } from './dto/create-cell-group.dto';
// Step 5: Re-export response DTOs for API documentation and type safety
export {
  DepartmentResponseDto,
  CellGroupResponseDto,
  NearestGroupResponseDto,
} from './dto/admin-response.dto';
