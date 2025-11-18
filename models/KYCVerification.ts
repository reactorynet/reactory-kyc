import mongoose, { Schema, Model, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/**
 * KYC Verification Model
 * 
 * Stores the main verification record for a user's KYC process
 */

export interface IKYCVerification {
  id: ObjectId;
  userId: ObjectId;
  organizationId: ObjectId;
  level: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'ENHANCED';
  status: 'INITIATED' | 'PENDING_DOCUMENTS' | 'SUBMITTED' | 'VALIDATING' | 'PROCESSING' | 
          'UNDER_REVIEW' | 'AUTO_APPROVED' | 'MANUALLY_APPROVED' | 'REJECTED' | 'FAILED' | 
          'ADDITIONAL_INFO_REQUIRED' | 'RETRY_PENDING' | 'COMPLETED' | 'TERMINATED';
  workflowType: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
  providerId?: string;
  providerCheckId?: string;
  providerResponse?: any;
  reviewerId?: ObjectId;
  documents: ObjectId[]; // References to KYCDocument
  riskScoreId?: ObjectId; // Reference to KYCRiskScore
  initiatedAt: Date;
  completedAt?: Date;
  completedBy?: string;
  rejectionReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKYCVerificationDocument extends IKYCVerification, Document {}

const KYCVerificationSchema = new Schema<IKYCVerificationDocument>({
  id: {
    type: Schema.Types.ObjectId,
    auto: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  level: {
    type: String,
    enum: ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'ENHANCED'],
    required: true,
    default: 'INTERMEDIATE'
  },
  status: {
    type: String,
    enum: [
      'INITIATED',
      'PENDING_DOCUMENTS',
      'SUBMITTED',
      'VALIDATING',
      'PROCESSING',
      'UNDER_REVIEW',
      'AUTO_APPROVED',
      'MANUALLY_APPROVED',
      'REJECTED',
      'FAILED',
      'ADDITIONAL_INFO_REQUIRED',
      'RETRY_PENDING',
      'COMPLETED',
      'TERMINATED'
    ],
    required: true,
    default: 'INITIATED',
    index: true
  },
  workflowType: {
    type: String,
    enum: ['MANUAL', 'AUTOMATED', 'HYBRID'],
    required: true,
    default: 'HYBRID'
  },
  providerId: {
    type: String,
    required: false
  },
  providerCheckId: {
    type: String,
    required: false,
    index: true
  },
  providerResponse: {
    type: Schema.Types.Mixed,
    required: false
  },
  reviewerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  documents: [{
    type: Schema.Types.ObjectId,
    ref: 'KYCDocument'
  }],
  riskScoreId: {
    type: Schema.Types.ObjectId,
    ref: 'KYCRiskScore',
    required: false
  },
  initiatedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  completedAt: {
    type: Date,
    required: false
  },
  completedBy: {
    type: String,
    required: false
  },
  rejectionReason: {
    type: String,
    required: false
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: false
  }
}, {
  timestamps: true,
  collection: 'kyc_verifications'
});

// Indexes for performance
KYCVerificationSchema.index({ userId: 1, status: 1 });
KYCVerificationSchema.index({ organizationId: 1, status: 1 });
KYCVerificationSchema.index({ createdAt: -1 });
KYCVerificationSchema.index({ level: 1, status: 1 });

// Instance methods
KYCVerificationSchema.methods = {
  isComplete(): boolean {
    return this.status === 'COMPLETED' || this.status === 'AUTO_APPROVED' || this.status === 'MANUALLY_APPROVED';
  },

  isFailed(): boolean {
    return this.status === 'REJECTED' || this.status === 'FAILED' || this.status === 'TERMINATED';
  },

  isPending(): boolean {
    return !this.isComplete() && !this.isFailed();
  },

  canRetry(): boolean {
    return this.status === 'FAILED' || this.status === 'RETRY_PENDING';
  }
};

// Static methods
KYCVerificationSchema.statics = {
  async findByUserId(userId: string | ObjectId): Promise<IKYCVerificationDocument[]> {
    return this.find({ userId }).sort({ createdAt: -1 }).exec();
  },

  async findPendingForReview(limit: number = 50): Promise<IKYCVerificationDocument[]> {
    return this.find({ 
      status: 'UNDER_REVIEW' 
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .exec();
  },

  async findByStatus(status: string, organizationId?: string | ObjectId): Promise<IKYCVerificationDocument[]> {
    const query: any = { status };
    if (organizationId) {
      query.organizationId = organizationId;
    }
    return this.find(query).sort({ createdAt: -1 }).exec();
  }
};

const KYCVerification: Model<IKYCVerificationDocument> = mongoose.model<IKYCVerificationDocument>(
  'KYCVerification',
  KYCVerificationSchema,
  'kyc_verifications'
);

export default KYCVerification;

