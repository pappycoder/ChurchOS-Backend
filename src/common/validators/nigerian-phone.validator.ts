import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsNigerianPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNigerianPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return /^(\+234|0)[789][01]\d{8}$/.test(value.replace(/\s/g, ''));
        },
        defaultMessage() {
          return 'Must be a valid Nigerian phone number (+234XXXXXXXXXX or 0XXXXXXXXXX)';
        },
      },
    });
  };
}
