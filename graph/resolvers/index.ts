import { mergeGraphResolver } from '@reactory/server-core/utils/graphql';
import KYCResolver from './KYCResolver';

export default mergeGraphResolver([
  KYCResolver
]);

