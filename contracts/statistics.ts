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
  approved: number;
  clientsServed: number;
  firstDelivery: TimeStatistic;
  internalReview: TimeStatistic;
  clients: StatisticsClient[];
  byClient: ClientStatistics[];
}
