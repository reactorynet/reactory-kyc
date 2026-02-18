import Reactory from '@reactorynet/reactory-core';
import GraphqlDefinitions from './graphql';
import Workflows from './workflow';
import Services from './services';
import Models from './models';
import Forms from './forms';
import Middlewares from './middleware';
import CliCommands from './cli';
import { KYCApiDefinition } from './api';

/**
 * Reactory KYC Module
 * 
 * Provides comprehensive KYC (Know Your Customer) identity verification
 * and compliance management capabilities.
 */
const ReactoryKYCModule: Reactory.Server.IReactoryModule = {
  id: 'reactory-kyc',
  nameSpace: 'reactory',
  version: '1.0.0',
  name: 'KYC',
  description: 'Know Your Customer (KYC) identity verification and compliance module',
  dependencies: [
    'reactory-core'
  ],
  priority: 10,
  graphDefinitions: GraphqlDefinitions,
  workflows: Workflows,
  forms: Forms,
  services: Services,
  models: Models,
  middleware: Middlewares,
  cli: CliCommands,
  routes: KYCApiDefinition,
  translations: [
    // Will be populated as we add i18n files
  ],
  clientPlugins: [],
  passportProviders: [],
  pdfs: [],
};

export default ReactoryKYCModule;

