/**
 * KYC GraphQL Definitions
 * 
 * Export all GraphQL schemas and resolvers
 */

import Reactory from '@reactory/reactory-core';
import TypeDefs from '../graph/types';
import Resolvers from '../graph/resolvers';

const GraphqlDefinitions: Reactory.Graph.IReactoryGraphDefinition = {
  name: 'reactory-kyc',
  version: '1.0.0',
  nameSpace: 'reactory',
  typeDefs: TypeDefs,
  resolvers: Resolvers,
  directives: []
};

export default GraphqlDefinitions;

