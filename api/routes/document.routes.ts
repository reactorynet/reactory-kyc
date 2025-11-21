import express, { Request, Response, NextFunction } from 'express';
import Reactory from '@reactory/reactory-core';
import { IKYCDocumentService } from '../../types';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * KYC Document REST API Routes
 */
export const createDocumentRoutes = (context: Reactory.Server.IReactoryContext) => {
  const router = express.Router();

  /**
   * Middleware to get Document service
   */
  const getDocumentService = (): IKYCDocumentService => {
    return context.getService('reactory-kyc.KYCDocumentService@1.0.0') as IKYCDocumentService;
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
   * POST /api/kyc/document/upload
   * Upload a KYC document
   */
  router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { verificationId, type, metadata } = req.body;

      if (!verificationId || !type) {
        return res.status(400).json({
          success: false,
          message: 'verificationId and type are required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'File is required'
        });
      }

      // Convert Express file to a format compatible with the service
      const file = {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer
      };

      const document = await documentService.uploadDocument(
        verificationId,
        type,
        file as any,
        metadata ? JSON.parse(metadata) : {}
      );

      return res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: document
      });
    } catch (error) {
      context.log('Error uploading document', { error, body: req.body }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * GET /api/kyc/document/:id
   * Get document by ID
   */
  router.get('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { id } = req.params;

      const document = await documentService.getDocument(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: document
      });
    } catch (error) {
      context.log('Error fetching document', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * GET /api/kyc/document/verification/:verificationId
   * Get documents by verification ID
   */
  router.get('/verification/:verificationId', requireAuth, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { verificationId } = req.params;

      const documents = await documentService.getDocumentsByVerification(verificationId);

      return res.status(200).json({
        success: true,
        data: documents
      });
    } catch (error) {
      context.log('Error fetching documents', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /api/kyc/document/:id/validate
   * Validate a document
   */
  router.post('/:id/validate', requireAdmin, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { id } = req.params;

      const document = await documentService.validateDocument(id);

      return res.status(200).json({
        success: true,
        message: 'Document validated successfully',
        data: document
      });
    } catch (error) {
      context.log('Error validating document', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * POST /api/kyc/document/:id/extract
   * Extract data from a document
   */
  router.post('/:id/extract', requireAdmin, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { id } = req.params;

      const document = await documentService.extractDocumentData(id);

      return res.status(200).json({
        success: true,
        message: 'Data extracted successfully',
        data: document
      });
    } catch (error) {
      context.log('Error extracting document data', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/kyc/document/:id
   * Delete a document
   */
  router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const { id } = req.params;

      await documentService.deleteDocument(id);

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      context.log('Error deleting document', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  /**
   * GET /api/kyc/document/:id/download
   * Download a document file
   */
  router.get('/:id/download', requireAuth, async (req: Request, res: Response) => {
    try {
      const documentService = getDocumentService();
      const fileService = context.getService('core.ReactoryFileService@1.0.0') as any;
      const { id } = req.params;

      const document = await documentService.getDocument(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Get file from file service
      const file = await fileService.getFile(document.fileId);

      if (!file) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      // Set headers for download
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
      res.setHeader('Content-Length', document.fileSize);

      // Stream file to response
      const stream = await fileService.getFileStream(document.fileId);
      stream.pipe(res);
    } catch (error) {
      context.log('Error downloading document', { error, params: req.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  return router;
};

