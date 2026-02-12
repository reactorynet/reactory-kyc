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
export const createDocumentRoutes = () => {
  const router = express.Router();

  /**
   * Middleware to get Document service
   */
  const getDocumentService = (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>): IKYCDocumentService => {
    return request.context.getService('reactory-kyc.KYCDocumentService@1.0.0') as IKYCDocumentService;
  };

  /**
   * Middleware to check authentication
   */
  const requireAuth = (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response, next: NextFunction) => {
    if (!request.context?.user || !request.context?.user?.id) {
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
  const requireAdmin = (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response, next: NextFunction) => {
    if (!request.context?.hasRole('KYC_ADMIN') && !request.context?.hasRole('KYC_REVIEWER')) {
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
  router.post('/upload', requireAuth, upload.single('file'), async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { verificationId, type, metadata } = request.body;

      if (!verificationId || !type) {
        return res.status(400).json({
          success: false,
          message: 'verificationId and type are required'
        });
      }

      if (!request?.file) {
        return res.status(400).json({
          success: false,
          message: 'File is required'
        });
      }

      // Convert Express file to a format compatible with the service
      const file = {
        filename: request.file.originalname,
        mimetype: request.file.mimetype,
        size: request.file.size,
        buffer: request.file.buffer
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
      request.context?.log('Error uploading document', { error, body: request.body }, 'error', 'KYC-API');
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
  router.get('/:id', requireAuth, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { id } = request.params;

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
      request.context?.log('Error fetching document', { error, params: request.params }, 'error', 'KYC-API');
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
  router.get('/verification/:verificationId', requireAuth, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { verificationId } = request.params;

      const documents = await documentService.getDocumentsByVerification(verificationId);

      return res.status(200).json({
        success: true,
        data: documents
      });
    } catch (error) {
      request.context?.log('Error fetching documents', { error, params: request.params }, 'error', 'KYC-API');
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
  router.post('/:id/validate', requireAdmin, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { id } = request.params;

      const document = await documentService.validateDocument(id);

      return res.status(200).json({
        success: true,
        message: 'Document validated successfully',
        data: document
      });
    } catch (error) {
      request.context?.log('Error validating document', { error, params: request.params }, 'error', 'KYC-API');
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
  router.post('/:id/extract', requireAdmin, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { id } = request.params;

      const document = await documentService.extractDocumentData(id);

      return res.status(200).json({
        success: true,
        message: 'Data extracted successfully',
        data: document
      });
    } catch (error) {
      request.context?.log('Error extracting document data', { error, params: request.params }, 'error', 'KYC-API');
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
  router.delete('/:id', requireAuth, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const { id } = request.params;

      await documentService.deleteDocument(id);

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      request.context?.log('Error deleting document', { error, params: request.params }, 'error', 'KYC-API');
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
  router.get('/:id/download', requireAuth, async (request: Reactory.Server.ReactoryExpressRequest<any, any, any, any, any>, res: Response) => {
    try {
      const documentService = getDocumentService(request);
      const fileService = request.context?.getService('core.ReactoryFileService@1.0.0') as any;
      const { id } = request.params;

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
      request.context?.log('Error downloading document', { error, params: request.params }, 'error', 'KYC-API');
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  return router;
};

