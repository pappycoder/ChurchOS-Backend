import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from '../../../src/pastoral/scoring.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { createPrismaMock } from '../../helpers/prisma-mock.helper';

describe('ScoringService', () => {
  let service: ScoringService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const mockChurchId = 'church-1';
  const mockMemberId = 'member-1';

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  describe('calculateEngagementScores', () => {
    it('should calculate engagement scores for all active members', async () => {
      prisma.member.findMany.mockResolvedValue([
        { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
      ]);

      prisma.attendance.count.mockResolvedValue(6);
      prisma.transaction.count.mockResolvedValue(2);
      prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 50000 } });
      prisma.eventRegistration.count.mockResolvedValue(2);
      prisma.message.count.mockResolvedValue(5);

      prisma.engagementScore.upsert.mockResolvedValue({} as any);

      const result = await service.calculateEngagementScores(mockChurchId);

      expect(result).toBe(1);
      expect(prisma.engagementScore.upsert).toHaveBeenCalled();
    });

    it('should handle zero active members', async () => {
      prisma.member.findMany.mockResolvedValue([]);

      const result = await service.calculateEngagementScores(mockChurchId);

      expect(result).toBe(0);
    });
  });

  describe('calculateRiskScores', () => {
    it('should calculate risk scores for all members', async () => {
      prisma.member.findMany.mockResolvedValue([{ id: mockMemberId, status: 'active' }]);

      prisma.attendance.count.mockResolvedValue(10);
      prisma.transaction.count.mockResolvedValue(3);
      prisma.message.count.mockResolvedValue(8);
      prisma.attendance.findFirst.mockResolvedValue({
        checkin_at: new Date(),
      });

      prisma.riskScore.upsert.mockResolvedValue({} as any);

      const result = await service.calculateRiskScores(mockChurchId);

      expect(result).toBe(1);
      expect(prisma.riskScore.upsert).toHaveBeenCalled();
    });
  });

  describe('getMembersNeedingAttention', () => {
    it('should return members with high/critical risk', async () => {
      prisma.riskScore.findMany.mockResolvedValue([
        {
          score: 85,
          level: 'critical',
          member: { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
        },
      ]);

      const result = await service.getMembersNeedingAttention(mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].level).toBe('critical');
    });
  });

  describe('getEngagementDistribution', () => {
    it('should return engagement distribution counts', async () => {
      prisma.engagementScore.count
        .mockResolvedValueOnce(10) // highly_engaged
        .mockResolvedValueOnce(20) // moderately_engaged
        .mockResolvedValueOnce(5) // low_engagement
        .mockResolvedValueOnce(2); // disengaged

      const result = await service.getEngagementDistribution(mockChurchId);

      expect(result.highly_engaged).toBe(10);
      expect(result.moderately_engaged).toBe(20);
      expect(result.low_engagement).toBe(5);
      expect(result.disengaged).toBe(2);
    });
  });

  describe('getRisingStars', () => {
    it('should return top engaging members', async () => {
      prisma.engagementScore.findMany.mockResolvedValue([
        {
          score: 90,
          member: { id: mockMemberId, first_name: 'John', last_name: 'Doe' },
        },
      ]);

      const result = await service.getRisingStars(mockChurchId);

      expect(result).toHaveLength(1);
      expect(result[0].score).toBe(90);
    });
  });
});
