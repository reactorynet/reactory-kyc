/**
 * KYC GraphQL Definitions
 * 
 * Export all GraphQL schemas and resolvers
 */

import Reactory from '@reactory/reactory-core';
import path from 'path';
import Resolvers from './resolvers';

// GraphQL schemas will be loaded from the schema directory
const schemas: string[] = [
  // Schema files will be loaded here
  // path.join(__dirname, 'schema', 'kyc.graphql'),
  // path.join(__dirname, 'schema', 'verification.graphql'),
  // path.join(__dirname, 'schema', 'document.graphql'),
];

const GraphqlDefinitions: Reactory.Graph.IReactoryGraphDefinition = {
  name: 'reactory-kyc',
  version: '1.0.0',
  nameSpace: 'reactory',
  typeDefs: schemas,
  resolvers: Resolvers,
  directives: []
};

export default GraphqlDefinitions;

