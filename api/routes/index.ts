import express from 'express';
import Reactory from '@reactory/reactory-core';
import { createVerificationRoutes } from './verification.routes';
import { createDocumentRoutes } from './document.routes';
import { createWebhookRoutes } from './webhook.routes';

/**
 * Main KYC API Router
 * Combines all KYC REST API routes
 */
export const createKYCRouter = (context: Reactory.Server.IReactoryContext) => {
  const router = express.Router();

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'KYC API is healthy',
      timestamp: new Date(),
      version: '1.0.0'
    });
  });

  // Mount sub-routers
  router.use('/verification', createVerificationRoutes(context));
  router.use('/document', createDocumentRoutes(context));
  router.use('/webhook', createWebhookRoutes(context));

  return router;
};

export default createKYCRouter;

