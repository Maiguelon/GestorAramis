import type { ContentFormat } from './domain';

export interface StatisticsFilter {
  from: string;
  through: string;
  clientId?: string;
  format?: ContentFormat;
}

export interface TimeStatistic {
  count: number;
  medianHours: number | null;
}

export interface StatisticsClient {
  id: string;
  name: string;
}

export interface ClientStatistics extends StatisticsClient {
  approved: number;
  reworked: number;
  sharedApproved: number;
  assigned: number;
  planApproved: number;
}

export interface WorkspaceStatistics {
  definitionVersion?: number;
  approved: number;
  clientsServed: number;
  firstDelivery: TimeStatistic;
  internalReview: TimeStatistic;
  clients: StatisticsClient[];
  byClient: ClientStatistics[];
  versions?: {
    count: number; median: number | null; one: number; two: number; threePlus: number;
  };
  deadline?: {
    count: number; onTime: number; late: number; unknown: number; percent: number | null;
  };
  pieces?: {
    id: string; title: string; format: ContentFormat; clients: string[];
    approvedAt: string; versions: number; teamChanges: number; clientChanges: number;
    deadline: string | null; deadlineResult: 'on_time' | 'late' | 'unknown';
  }[];
}

export interface StatisticsSnapshotSummary {
  month: string; capturedAt: string; captureType: 'manual' | 'automatic'; definitionVersion: number;
}
export interface StatisticsSnapshot extends StatisticsSnapshotSummary { report: WorkspaceStatistics }
