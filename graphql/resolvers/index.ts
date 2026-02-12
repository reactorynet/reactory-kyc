import { mergeGraphResolver } from '@reactory/server-core/utils';
import KYCResolver from './KYCResolver';

export default mergeGraphResolver([
  KYCResolver
]);

