import type { ObjectId } from 'mongodb';
import type { NotificationContent } from '@/_app/emails/index.server';

export type NotificationType = NotificationContent['type'];
export type NotificationDispatchState = 'pending' | 'sending' | 'accepted' | 'failed' | 'unknown' | 'suppressed' | 'cancelled';
export type NotificationDeliveryState = 'unconfirmed' | 'delayed' | 'delivered' | 'bounced' | 'complained' | 'failed';

export interface NotificationJob {
  _id: ObjectId;
  schemaVersion: 1;
  templateVersion: '1';
  locale: 'en';
  key: string;
  environment: 'stage' | 'production';
  orderId: ObjectId;
  refundId?: ObjectId;
  retryOf?: ObjectId;
  type: NotificationType;
  eventKey: string;
  audience: 'buyer' | 'admin';
  recipient: string;
  recipientHash: string;
  adminUserId?: ObjectId;
  content: NotificationContent;
  sourceAt: Date;
  createdAt: Date;
  updatedAt: Date;
  status: NotificationDispatchState;
  delivery: NotificationDeliveryState;
  attempts: number;
  nextAttemptAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  firstRequestAt?: Date;
  outcomeUncertain?: boolean;
  frozen?: {
    to: string; subject: string; html: string; text: string; idempotencyKey: string;
    from?: string; replyTo?: string; jobId: string;
  };
  providerMessageId?: string;
  acceptedAt?: Date;
  lastErrorCode?: string;
  lastEventAt?: Date;
}

export interface NotificationEvent {
  _id: ObjectId;
  schemaVersion: 1;
  provider: 'resend';
  eventId: string;
  type: string;
  providerMessageId?: string;
  jobId?: ObjectId;
  occurredAt: Date;
  receivedAt: Date;
  lastAttemptAt?: Date;
  status: 'pending' | 'applied' | 'ignored';
}

export interface NotificationSuppression {
  _id: ObjectId;
  schemaVersion: 1;
  environment: 'stage' | 'production';
  recipientHash: string;
  reason: 'bounced' | 'complained';
  createdAt: Date;
  updatedAt: Date;
}
