import express, { Request, Response, NextFunction } from 'express';
import Reactory from '@reactory/reactory-core';
import { verifyHmacSignature } from '../../providers/utils/webhookVerification';

/**
 * KYC Webhook REST API Routes
 * Handles incoming webhooks from external KYC providers
 */
export const createWebhookRoutes = (context: Reactory.Server.IReactoryContext) => {
  const router = express.Router();

  /**
   * Middleware to log webhook requests
   */
  const logWebhook = (req: Request, res: Response, next: NextFunction) => {
    context.log('Webhook received', {
      provider: req.params.provider,
      headers: req.headers,
      body: req.body
    }, 'debug', 'KYC-Webhook');
    next();
  };

  /**
   * Middleware to verify webhook signature
   */
  const verifySignature = (secretKey: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const signature = req.headers['x-webhook-signature'] as string;
      const timestamp = req.headers['x-webhook-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({
          success: false,
          message: 'Missing webhook signature or timestamp'
        });
      }

      const payload = JSON.stringify(req.body);
      const isValid = verifyHmacSignature(payload, signature, secretKey, timestamp);

      if (!isValid) {
        context.log('Invalid webhook signature', {
          signature,
          timestamp,
          provider: req.params.provider
        }, 'warn', 'KYC-Webhook');
        
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      next();
    };
  };

  /**
   * POST /api/kyc/webhook/trulio
   * Handle Trulio webhooks
   */
  router.post('/trulio', logWebhook, async (req: Request, res: Response) => {
    try {
      const queueService = context.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider: 'trulio',
          event: req.body.event,
          payload: req.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      context.log('Error processing Trulio webhook', { error, body: req.body }, 'error', 'KYC-Webhook');
      return res.status(500).json({
        success: false,
        message: 'Error processing webhook'
      });
    }
  });

  /**
   * POST /api/kyc/webhook/onfido
   * Handle Onfido webhooks
   */
  router.post('/onfido', logWebhook, async (req: Request, res: Response) => {
    try {
      const queueService = context.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider: 'onfido',
          event: req.body.payload?.action,
          payload: req.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      context.log('Error processing Onfido webhook', { error, body: req.body }, 'error', 'KYC-Webhook');
      return res.status(500).json({
        success: false,
        message: 'Error processing webhook'
      });
    }
  });

  /**
   * POST /api/kyc/webhook/:provider
   * Generic webhook handler for any provider
   */
  router.post('/:provider', logWebhook, async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const queueService = context.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider,
          event: req.body.event || req.body.type,
          payload: req.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      context.log('Error processing webhook', { error, body: req.body, provider: req.params.provider }, 'error', 'KYC-Webhook');
      return res.status(500).json({
        success: false,
        message: 'Error processing webhook'
      });
    }
  });

  /**
   * GET /api/kyc/webhook/health
   * Webhook health check endpoint
   */
  router.get('/health', (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date()
    });
  });

  return router;
};

