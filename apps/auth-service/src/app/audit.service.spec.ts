import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service.js';
import { AuditLogEntity } from './entities/audit-log.entity.js';

describe('AuditService', () => {
  let module: TestingModule;
  let service: AuditService;

  let mockRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findBy: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const buildQbMock = () => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 2 }),
  });

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((v) => v),
      save:   jest.fn().mockResolvedValue(undefined),
      findBy: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => buildQbMock()),
    };

    module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLogEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(AuditService);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await module.close();
    jest.restoreAllMocks();
  });

  // ── logEvent ──────────────────────────────────────────────────────────────────

  describe('logEvent', () => {
    it('creates and saves an entry with non-empty metadata', async () => {
      await service.logEvent('LOGIN', 'user-1', '127.0.0.1', 'jest-agent', 'success', { foo: 'bar' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LOGIN',
          userId:    'user-1',
          outcome:   'success',
          metadata:  { foo: 'bar' },
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('stores null metadata when metadata object is empty', async () => {
      await service.logEvent('LOGOUT', 'user-2', '10.0.0.1', 'agent', 'success', {});

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it('stores null metadata when metadata is not provided', async () => {
      await service.logEvent('REGISTER', null, '10.0.0.2', 'agent', 'failure');

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });

    it('logs to console with unknown for null userId', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      await service.logEvent('TOKEN_REFRESH', null, '1.2.3.4', 'ua', 'failure');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[AUDIT]'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('TOKEN_REFRESH'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });

    it('logs userId in console output when provided', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      await service.logEvent('LOGIN', 'uid-99', '1.2.3.4', 'ua', 'success');
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('uid-99'));
    });

    it('persists a ROLE_CHANGE event with target + direction + actor in metadata', async () => {
      await service.logEvent(
        'ROLE_CHANGE',
        'actor-uid',
        '127.0.0.1',
        'jest-agent',
        'success',
        {
          targetUserId: 'target-uid',
          fromRole:     'user',
          toRole:       'admin',
          actorUserId:  'actor-uid',
        },
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ROLE_CHANGE',
          userId:    'actor-uid',
          outcome:   'success',
          metadata:  {
            targetUserId: 'target-uid',
            fromRole:     'user',
            toRole:       'admin',
            actorUserId:  'actor-uid',
          },
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  // ── getEntriesForUser ─────────────────────────────────────────────────────────

  describe('getEntriesForUser', () => {
    it('returns mapped entries for a user', async () => {
      const now = new Date().toISOString();
      mockRepo.findBy.mockResolvedValue([
        {
          id: 'entry-1',
          eventType: 'LOGIN',
          userId: 'user-A',
          ipAddress: '1.1.1.1',
          userAgent: 'ua',
          occurredAt: now,
          outcome: 'success',
          metadata: { k: 'v' },
        },
        {
          id: 'entry-2',
          eventType: 'LOGOUT',
          userId: 'user-A',
          ipAddress: '1.1.1.1',
          userAgent: 'ua',
          occurredAt: now,
          outcome: 'success',
          metadata: null,
        },
      ]);

      const entries = await service.getEntriesForUser('user-A');

      expect(mockRepo.findBy).toHaveBeenCalledWith({ userId: 'user-A' });
      expect(entries).toHaveLength(2);
      expect(entries[0].metadata).toEqual({ k: 'v' });
      expect(entries[1].metadata).toEqual({});  // null → {}
    });

    it('returns empty array when user has no entries', async () => {
      mockRepo.findBy.mockResolvedValue([]);
      const entries = await service.getEntriesForUser('nonexistent');
      expect(entries).toEqual([]);
    });
  });

  // ── anonymiseUser ─────────────────────────────────────────────────────────────

  describe('anonymiseUser', () => {
    it('calls queryBuilder with correct update parameters', async () => {
      const qbMock = buildQbMock();
      mockRepo.createQueryBuilder.mockReturnValue(qbMock);

      await service.anonymiseUser('original-id', 'DELETED_abc123');

      expect(qbMock.update).toHaveBeenCalledWith(AuditLogEntity);
      expect(qbMock.set).toHaveBeenCalledWith({ userId: 'DELETED_abc123' });
      expect(qbMock.where).toHaveBeenCalledWith('userId = :userId', { userId: 'original-id' });
      expect(qbMock.execute).toHaveBeenCalled();
    });

    it('resolves without error when no rows match', async () => {
      const qbMock = buildQbMock();
      qbMock.execute.mockResolvedValue({ affected: 0 });
      mockRepo.createQueryBuilder.mockReturnValue(qbMock);

      await expect(service.anonymiseUser('ghost-id', 'DELETED_ghost')).resolves.toBeUndefined();
    });
  });
});
