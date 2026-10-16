import { SetMetadata } from '@nestjs/common';
/** Provider callbacks/challenges must retain their required wire format. */
export const RAW_RESPONSE = 'provider_raw_response';
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
