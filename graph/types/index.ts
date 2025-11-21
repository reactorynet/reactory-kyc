import { loadGraphQLTypeDefinitions } from '@reactory/server-core/utils/graphql';
import path from 'path';

const typeDefs = loadGraphQLTypeDefinitions([
  'KYC'
], path.join(__dirname));

export default typeDefs;

