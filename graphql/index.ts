import resolvers from './resolvers';
import types from './types';

export const KYCGraphqlDefinitions: Reactory.Graph.IGraphDefinitions = {
  Types: types,
  Resolvers: resolvers,
};

export default KYCGraphqlDefinitions;