import mongoose, { Schema, Model, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

/**
 * KYC Provider Model
 * 
 * Stores configuration and metadata for third-party KYC providers
 */

export interface IRateLimit {
  requestsPerSecond: number;
  requestsPerDay: number;
  requestsPerMonth?: number;
}

export interface IProviderCapability {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface IKYCProvider {
  id: ObjectId;
  name: string;
  type: 'trulio' | 'onfido' | 'custom';
  enabled: boolean;
  apiKey?: string; // Encrypted
  apiUrl: string;
  webhookSecret?: string; // Encrypted
  timeout: number; // milliseconds
  capabilities: IProviderCapability[];
  rateLimits?: IRateLimit;
  priority: number; // For provider selection
  lastUsed?: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime?: number; // milliseconds
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKYCProviderDocument extends IKYCProvider, Document {}

const ProviderCapabilitySchema = new Schema<IProviderCapability>({
  name: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true
  },
  config: {
    type: Schema.Types.Mixed,
    required: false
  }
}, { _id: false });

const RateLimitSchema = new Schema<IRateLimit>({
  requestsPerSecond: {
    type: Number,
    required: true,
    min: 1
  },
  requestsPerDay: {
    type: Number,
    required: true,
    min: 1
  },
  requestsPerMonth: {
    type: Number,
    required: false
  }
}, { _id: false });

const KYCProviderSchema = new Schema<IKYCProviderDocument>({
  id: {
    type: Schema.Types.ObjectId,
    auto: true
  },
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  type: {
    type: String,
    enum: ['trulio', 'onfido', 'custom'],
    required: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },
  apiKey: {
    type: String,
    required: false,
    select: false // Don't include in queries by default for security
  },
  apiUrl: {
    type: String,
    required: true,
    trim: true
  },
  webhookSecret: {
    type: String,
    required: false,
    select: false // Don't include in queries by default for security
  },
  timeout: {
    type: Number,
    required: true,
    default: 30000, // 30 seconds
    min: 1000,
    max: 300000 // 5 minutes max
  },
  capabilities: {
    type: [ProviderCapabilitySchema],
    required: true,
    default: []
  },
  rateLimits: {
    type: RateLimitSchema,
    required: false
  },
  priority: {
    type: Number,
    required: true,
    default: 100,
    min: 1,
    max: 1000,
    index: true
  },
  lastUsed: {
    type: Date,
    required: false,
    index: true
  },
  totalRequests: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  successfulRequests: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  failedRequests: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  averageResponseTime: {
    type: Number,
    required: false,
    min: 0
  },
  metadata: {
    type: Schema.Types.Mixed,
    required: false
  }
}, {
  timestamps: true,
  collection: 'kyc_providers'
});

// Indexes for performance
KYCProviderSchema.index({ enabled: 1, priority: -1 });
KYCProviderSchema.index({ type: 1, enabled: 1 });

// Instance methods
KYCProviderSchema.methods = {
  isAvailable(): boolean {
    return this.enabled;
  },

  getSuccessRate(): number {
    if (this.totalRequests === 0) return 0;
    return (this.successfulRequests / this.totalRequests) * 100;
  },

  hasCapability(capabilityName: string): boolean {
    return this.capabilities.some(cap => cap.name === capabilityName && cap.enabled);
  },

  incrementRequests(success: boolean, responseTime?: number): void {
    this.totalRequests += 1;
    if (success) {
      this.successfulRequests += 1;
    } else {
      this.failedRequests += 1;
    }
    this.lastUsed = new Date();

    // Update average response time
    if (responseTime !== undefined) {
      if (this.averageResponseTime) {
        this.averageResponseTime = 
          (this.averageResponseTime * (this.totalRequests - 1) + responseTime) / this.totalRequests;
      } else {
        this.averageResponseTime = responseTime;
      }
    }
  },

  isHealthy(): boolean {
    const successRate = this.getSuccessRate();
    return this.enabled && 
           successRate >= 80 && 
           (this.averageResponseTime === undefined || this.averageResponseTime < this.timeout * 0.8);
  }
};

// Static methods
KYCProviderSchema.statics = {
  async findEnabled(): Promise<IKYCProviderDocument[]> {
    return this.find({ enabled: true })
      .sort({ priority: -1 })
      .exec();
  },

  async findByType(type: string): Promise<IKYCProviderDocument[]> {
    return this.find({ type, enabled: true })
      .sort({ priority: -1 })
      .exec();
  },

  async findBestProvider(capability?: string): Promise<IKYCProviderDocument | null> {
    const query: any = { enabled: true };
    
    if (capability) {
      query['capabilities'] = {
        $elemMatch: {
          name: capability,
          enabled: true
        }
      };
    }

    const providers = await this.find(query)
      .sort({ priority: -1, successfulRequests: -1 })
      .limit(5)
      .exec();

    if (providers.length === 0) return null;

    // Select best provider based on success rate and response time
    let bestProvider = providers[0];
    let bestScore = 0;

    for (const provider of providers) {
      const successRate = provider.getSuccessRate();
      const responseTimeScore = provider.averageResponseTime
        ? Math.max(0, 100 - (provider.averageResponseTime / 1000))
        : 50;
      
      const score = (successRate * 0.7) + (responseTimeScore * 0.3);
      
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  },

  async getStatistics(): Promise<{
    total: number;
    enabled: number;
    disabled: number;
    byType: Record<string, number>;
    avgSuccessRate: number;
  }> {
    const all = await this.find({}).exec();
    const enabled = all.filter(p => p.enabled);
    
    const byType = all.reduce((acc, provider) => {
      acc[provider.type] = (acc[provider.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgSuccessRate = enabled.length > 0
      ? enabled.reduce((sum, p) => sum + p.getSuccessRate(), 0) / enabled.length
      : 0;

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      byType,
      avgSuccessRate
    };
  }
};

const KYCProvider: Model<IKYCProviderDocument> = mongoose.model<IKYCProviderDocument>(
  'KYCProvider',
  KYCProviderSchema,
  'kyc_providers'
);

export default KYCProvider;

