import { loadGraphQLTypeDefinitions } from '@reactory/server-core/graph/graphql-loader';
import path from 'path';

const typeDefs = loadGraphQLTypeDefinitions([
  'KYC'
], path.join(__dirname));

export default typeDefs;

