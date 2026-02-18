import Reactory from '@reactorynet/reactory-core';
import { createKYCRouter } from './routes';
import { Router } from 'express';

/**
 * KYC API Definition
 * Exports the API router for registration with the Reactory application
 */
export const KYCApiDefinition: { [key: string]: Router } = {
  'kyc': createKYCRouter()
};
