import mongoose, { Schema, Model, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/**
 * KYC Document Model
 * 
 * Stores information about documents uploaded for KYC verification
 * Links to ReactoryFile for actual file storage
 */

export interface IKYCDocument {
  id: ObjectId;
  verificationId: ObjectId;
  documentType: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'PROOF_OF_ADDRESS' | 
                'BANK_STATEMENT' | 'UTILITY_BILL' | 'SELFIE' | 'LIVENESS_VIDEO';
  documentNumber?: string;
  issuingCountry?: string;
  issueDate?: Date;
  expiryDate?: Date;
  fileId: ObjectId; // Reference to ReactoryFile model
  fileUrl?: string;
  encryptedFileUrl?: string;
  fileHash: string;
  extractedData?: Record<string, any>;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'expired' | 'processing';
  validationErrors?: string[];
  uploadedAt: Date;
  validatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKYCDocumentDocument extends IKYCDocument, Document {}

const KYCDocumentSchema = new Schema<IKYCDocumentDocument>({
  id: {
    type: Schema.Types.ObjectId,
    auto: true
  },
  verificationId: {
    type: Schema.Types.ObjectId,
    ref: 'KYCVerification',
    required: true,
    index: true
  },
  documentType: {
    type: String,
    enum: [
      'PASSPORT',
      'NATIONAL_ID',
      'DRIVERS_LICENSE',
      'PROOF_OF_ADDRESS',
      'BANK_STATEMENT',
      'UTILITY_BILL',
      'SELFIE',
      'LIVENESS_VIDEO'
    ],
    required: true
  },
  documentNumber: {
    type: String,
    required: false
  },
  issuingCountry: {
    type: String,
    required: false,
    uppercase: true,
    minlength: 2,
    maxlength: 3 // ISO country codes
  },
  issueDate: {
    type: Date,
    required: false
  },
  expiryDate: {
    type: Date,
    required: false
  },
  fileId: {
    type: Schema.Types.ObjectId,
    ref: 'ReactoryFile',
    required: true,
    index: true
  },
  fileUrl: {
    type: String,
    required: false
  },
  encryptedFileUrl: {
    type: String,
    required: false
  },
  fileHash: {
    type: String,
    required: true
  },
  extractedData: {
    type: Schema.Types.Mixed,
    required: false
  },
  validationStatus: {
    type: String,
    enum: ['pending', 'valid', 'invalid', 'expired', 'processing'],
    required: true,
    default: 'pending',
    index: true
  },
  validationErrors: [{
    type: String
  }],
  uploadedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  validatedAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true,
  collection: 'kyc_documents'
});

// Indexes for performance
KYCDocumentSchema.index({ verificationId: 1, documentType: 1 });
KYCDocumentSchema.index({ validationStatus: 1, createdAt: -1 });
KYCDocumentSchema.index({ fileHash: 1 }, { unique: true });
KYCDocumentSchema.index({ documentNumber: 1 });

// Instance methods
KYCDocumentSchema.methods = {
  isValid(): boolean {
    return this.validationStatus === 'valid';
  },

  isExpired(): boolean {
    if (!this.expiryDate) return false;
    return this.expiryDate < new Date();
  },

  requiresReview(): boolean {
    return this.validationStatus === 'invalid' || this.isExpired();
  },

  isPending(): boolean {
    return this.validationStatus === 'pending' || this.validationStatus === 'processing';
  }
};

// Static methods
KYCDocumentSchema.statics = {
  async findByVerificationId(verificationId: string | ObjectId): Promise<IKYCDocumentDocument[]> {
    return this.find({ verificationId }).sort({ uploadedAt: -1 }).exec();
  },

  async findByType(
    verificationId: string | ObjectId,
    documentType: string
  ): Promise<IKYCDocumentDocument | null> {
    return this.findOne({ verificationId, documentType }).exec();
  },

  async findPendingValidation(limit: number = 100): Promise<IKYCDocumentDocument[]> {
    return this.find({
      validationStatus: { $in: ['pending', 'processing'] }
    })
    .sort({ uploadedAt: 1 })
    .limit(limit)
    .exec();
  },

  async findExpiredDocuments(): Promise<IKYCDocumentDocument[]> {
    return this.find({
      expiryDate: { $lt: new Date() },
      validationStatus: 'valid'
    }).exec();
  }
};

export const KYCDocument: Model<IKYCDocumentDocument> = mongoose.model<IKYCDocumentDocument>(
  'KYCDocument',
  KYCDocumentSchema,
  'kyc_documents'
);

export default KYCDocument;

