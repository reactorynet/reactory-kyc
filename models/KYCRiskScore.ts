import mongoose, { Schema, Model, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/**
 * KYC Risk Score Model
 * 
 * Stores risk assessment scores for KYC verifications
 */

export interface IRiskFactor {
  factor: string;
  score: number;
  weight: number;
  description?: string;
}

export interface IKYCRiskScore {
  id: ObjectId;
  verificationId: ObjectId;
  totalScore: number; // 0-100
  scoreBreakdown: Record<string, number>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: IRiskFactor[];
  assessmentMethod: string; // e.g., 'automated', 'manual', 'hybrid'
  assessedBy?: string; // userId or 'system'
  calculatedAt: Date;
  updatedAt: Date;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface IKYCRiskScoreDocument extends IKYCRiskScore, Document {}

const RiskFactorSchema = new Schema<IRiskFactor>({
  factor: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  weight: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  description: {
    type: String,
    required: false
  }
}, { _id: false });

const KYCRiskScoreSchema = new Schema<IKYCRiskScoreDocument>({
  id: {
    type: Schema.Types.ObjectId,
    auto: true
  },
  verificationId: {
    type: Schema.Types.ObjectId,
    ref: 'KYCVerification',
    required: true,
    unique: true,
    index: true
  },
  totalScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    index: true
  },
  scoreBreakdown: {
    type: Schema.Types.Mixed,
    required: true
  },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
    index: true
  },
  riskFactors: {
    type: [RiskFactorSchema],
    required: true,
    default: []
  },
  assessmentMethod: {
    type: String,
    required: true,
    enum: ['automated', 'manual', 'hybrid', 'provider'],
    default: 'automated'
  },
  assessedBy: {
    type: String,
    required: false,
    default: 'system'
  },
  calculatedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  notes: {
    type: String,
    required: false
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: false
  }
}, {
  timestamps: { createdAt: 'calculatedAt', updatedAt: true },
  collection: 'kyc_risk_scores'
});

// Indexes for performance
KYCRiskScoreSchema.index({ riskLevel: 1, calculatedAt: -1 });
KYCRiskScoreSchema.index({ totalScore: -1 });

// Instance methods
KYCRiskScoreSchema.methods = {
  isLowRisk(): boolean {
    return this.riskLevel === 'LOW';
  },

  isHighRisk(): boolean {
    return this.riskLevel === 'HIGH' || this.riskLevel === 'CRITICAL';
  },

  requiresManualReview(): boolean {
    return this.totalScore < 40 || this.riskLevel === 'HIGH' || this.riskLevel === 'CRITICAL';
  },

  canAutoApprove(threshold: number = 70): boolean {
    return this.totalScore >= threshold && this.riskLevel === 'LOW';
  },

  getTopRiskFactors(limit: number = 5): IRiskFactor[] {
    return this.riskFactors
      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
      .slice(0, limit);
  }
};

// Static methods
KYCRiskScoreSchema.statics = {
  async findByVerificationId(verificationId: string | ObjectId): Promise<IKYCRiskScoreDocument | null> {
    return this.findOne({ verificationId }).exec();
  },

  async findByRiskLevel(riskLevel: string, limit: number = 100): Promise<IKYCRiskScoreDocument[]> {
    return this.find({ riskLevel })
      .sort({ calculatedAt: -1 })
      .limit(limit)
      .exec();
  },

  async findHighRisk(limit: number = 100): Promise<IKYCRiskScoreDocument[]> {
    return this.find({
      riskLevel: { $in: ['HIGH', 'CRITICAL'] }
    })
    .sort({ totalScore: 1 })
    .limit(limit)
    .exec();
  },

  async getAverageScore(
    startDate?: Date,
    endDate?: Date
  ): Promise<{ avgScore: number; count: number }> {
    const match: any = {};
    if (startDate || endDate) {
      match.calculatedAt = {};
      if (startDate) match.calculatedAt.$gte = startDate;
      if (endDate) match.calculatedAt.$lte = endDate;
    }

    const result = await this.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$totalScore' },
          count: { $sum: 1 }
        }
      }
    ]);

    return result.length > 0
      ? { avgScore: result[0].avgScore, count: result[0].count }
      : { avgScore: 0, count: 0 };
  }
};

const KYCRiskScore: Model<IKYCRiskScoreDocument> = mongoose.model<IKYCRiskScoreDocument>(
  'KYCRiskScore',
  KYCRiskScoreSchema,
  'kyc_risk_scores'
);

export default KYCRiskScore;

