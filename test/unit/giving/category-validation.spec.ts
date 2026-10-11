import { ValidationPipe } from '@nestjs/common';
import { CreateCategoryDto } from '../../../src/giving/dto/create-category.dto';
import { UpdateCategoryDto } from '../../../src/giving/dto/update-category.dto';

describe('Giving category request validation', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  it.each([true, false])('accepts isActive=%s when creating a category', async (isActive) => {
    const result = await pipe.transform(
      { name: 'Offering', isActive },
      { type: 'body', metatype: CreateCategoryDto },
    );
    expect(result.isActive).toBe(isActive);
  });
  it('rejects a non-boolean active flag', async () => {
    await expect(
      pipe.transform(
        { name: 'Offering', isActive: 'false' },
        { type: 'body', metatype: CreateCategoryDto },
      ),
    ).rejects.toThrow();
  });
  it('accepts active flags on updates and rejects unsupported branch changes', async () => {
    expect(
      await pipe.transform({ isActive: false }, { type: 'body', metatype: UpdateCategoryDto }),
    ).toMatchObject({ isActive: false });
    await expect(
      pipe.transform({ branchId: 'branch' }, { type: 'body', metatype: UpdateCategoryDto }),
    ).rejects.toThrow();
  });
});
