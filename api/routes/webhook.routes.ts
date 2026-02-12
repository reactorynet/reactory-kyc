import express, { Request, Response, NextFunction, request } from 'express';
import Reactory from '@reactory/reactory-core';
import { verifyHmacSignature } from '../../providers/utils/webhookVerification';

/**
 * KYC Webhook REST API Routes
 * Handles incoming webhooks from external KYC providers
 */
export const createWebhookRoutes = () => {
  const router = express.Router();

  /**
   * Middleware to log webhook requests
   */
  const logWebhook = (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response, next: NextFunction) => {
    request.context?.log('Webhook received', {
      provider: request.params.provider,
      headers: request.headers,
      body: request.body
    }, 'debug', 'KYC-Webhook');
    next();
  };

  /**
   * Middleware to verify webhook signature
   */
  const verifySignature = (secretKey: string) => {
    return (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response, next: NextFunction) => {
      const signature = request.headers['x-webhook-signature'] as string;
      const timestamp = request.headers['x-webhook-timestamp'] as string;

      if (!signature || !timestamp) {
        return res.status(401).json({
          success: false,
          message: 'Missing webhook signature or timestamp'
        });
      }

      const payload = JSON.stringify(request.body);
      const isValid = verifyHmacSignature(payload, signature, secretKey, timestamp);

      if (!isValid) {
        request.context?.log('Invalid webhook signature', {
          signature,
          timestamp,
          provider: request.params.provider
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
  router.post('/trulio', logWebhook, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const queueService = request.context?.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider: 'trulio',
          event: request.body.event,
          payload: request.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      request.context?.log('Error processing Trulio webhook', { error, body: request.body }, 'error', 'KYC-Webhook');
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
  router.post('/onfido', logWebhook, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const queueService = request.context?.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider: 'onfido',
          event: request.body.payload?.action,
          payload: request.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      request.context?.log('Error processing Onfido webhook', { error, body: request.body }, 'error', 'KYC-Webhook');
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
  router.post('/:provider', logWebhook, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const { provider } = request.params;
      const queueService = request.context?.getService('reactory-queue.QueueProvider@1.0.0') as any;
      
      // Add webhook to processing queue
      await queueService.addJob('kyc-webhook', {
        type: 'webhook',
        data: {
          provider,
          event: request.body.event || request.body.type,
          payload: request.body,
          receivedAt: new Date()
        }
      });

      // Acknowledge receipt immediately
      return res.status(200).json({
        success: true,
        message: 'Webhook received and queued for processing'
      });
    } catch (error) {
      request.context?.log('Error processing webhook', { error, body: request.body, provider: request.params.provider }, 'error', 'KYC-Webhook');
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
  router.get('/health', (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    return res.status(200).json({
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date()
    });
  });

  return router;
};

