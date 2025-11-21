import express, { Request, Response, NextFunction } from 'express';
import Reactory from '@reactory/reactory-core';
import { IKYCService } from '../../types';

/**
 * KYC Verification REST API Routes
 */
export const createVerificationRoutes = (context: Reactory.Server.IReactoryContext) => {
  const router = express.Router();

  /**
   * Middleware to get KYC service
   */
  const getKYCService = (): IKYCService => {
    return context.getService('reactory-kyc.KYCService@1.0.0') as IKYCService;
  };

  /**
   * Middleware to check authentication
   */
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!context.user || !context.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    next();
  };

  /**
   * Middleware to check admin role
   */
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!context.hasRole('KYC_ADMIN') && !context.hasRole('KYC_REVIEWER')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    next();
  };

  /**
   * POST /api/kyc/verification/initiate
   * Initiate a new KYC verification
   */
  router.post('/initiate', requireAuth, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { userId, level, workflow, metadata } = req.body;

      if (!userId || !level) {
        return res.status(400).json({
          success: false,
          message: 'userId and level are required'
        });
      }

      const verification = await kycService.initiateVerification(
        userId,
        level,
        workflow,
        metadata
      );

      return res.status(201).json({
        success: true,
        message: 'Verification initiated successfully',
        data: verification
      });
    } catch (error) {
      context.log('Error initiating verification', { error, body: req.body }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * GET /api/kyc/verification/:id
   * Get verification status
   */
  router.get('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;

      const verification = await kycService.getVerificationStatus(id);

      if (!verification) {
        return res.status(404).json({
          success: false,
          message: 'Verification not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: verification
      });
    } catch (error) {
      context.log('Error fetching verification', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * GET /api/kyc/verification/user/:userId
   * Get verification history for a user
   */
  router.get('/user/:userId', requireAuth, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { userId } = req.params;

      // Users can only view their own history unless they're an admin
      if (userId !== context.user.id && !context.hasRole('KYC_ADMIN')) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view this user\'s verification history'
        });
      }

      const verifications = await kycService.getVerificationHistory(userId);

      return res.status(200).json({
        success: true,
        data: verifications
      });
    } catch (error) {
      context.log('Error fetching verification history', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * PUT /api/kyc/verification/:id
   * Update verification
   */
  router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;
      const updates = req.body;

      const verification = await kycService.updateVerification(id, updates);

      return res.status(200).json({
        success: true,
        message: 'Verification updated successfully',
        data: verification
      });
    } catch (error) {
      context.log('Error updating verification', { error, params: req.params, body: req.body }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /api/kyc/verification/:id/approve
   * Approve verification
   */
  router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;
      const { notes } = req.body;

      const verification = await kycService.approveVerification(id, notes);

      return res.status(200).json({
        success: true,
        message: 'Verification approved successfully',
        data: verification
      });
    } catch (error) {
      context.log('Error approving verification', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /api/kyc/verification/:id/reject
   * Reject verification
   */
  router.post('/:id/reject', requireAdmin, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;
      const { reason, notes } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const verification = await kycService.rejectVerification(id, reason, notes);

      return res.status(200).json({
        success: true,
        message: 'Verification rejected',
        data: verification
      });
    } catch (error) {
      context.log('Error rejecting verification', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /api/kyc/verification/:id/request-info
   * Request additional information
   */
  router.post('/:id/request-info', requireAdmin, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;
      const { requestedDocuments, message } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required'
        });
      }

      const verification = await kycService.requestAdditionalInfo(
        id,
        requestedDocuments,
        message
      );

      return res.status(200).json({
        success: true,
        message: 'Additional information requested',
        data: verification
      });
    } catch (error) {
      context.log('Error requesting additional info', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/kyc/verification/:id
   * Cancel verification
   */
  router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const kycService = getKYCService();
      const { id } = req.params;

      const verification = await kycService.updateVerification(id, {
        status: 'CANCELLED'
      });

      return res.status(200).json({
        success: true,
        message: 'Verification cancelled',
        data: verification
      });
    } catch (error) {
      context.log('Error cancelling verification', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  return router;
};

