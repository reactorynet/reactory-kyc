/**
 * KYC GraphQL Definitions
 * 
 * Export all GraphQL schemas and resolvers
 */

import Reactory from '@reactory/reactory-core';
import TypeDefs from '../graph/types';
import Resolvers from '../graph/resolvers';

const GraphqlDefinitions: Reactory.Graph.IGraphDefinitions = {
  Types: TypeDefs,
  Resolvers: Resolvers,
};

export default GraphqlDefinitions;

