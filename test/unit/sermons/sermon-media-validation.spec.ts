import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSermonDto } from '../../../src/sermons/dto/create-sermon.dto';
import { UpdateSermonDto } from '../../../src/sermons/dto/update-sermon.dto';

describe('Sermon recording inputs', () => {
  it.each([
    'https://podcasts.example/recording.mp3',
    'https://youtube.com/watch?v=recording-a',
    'https://church-os-web.vercel.app/api/backend/media/files/asset-a',
  ])('accepts the file or external URL %s', async (url) => {
    expect(
      await validate(
        plainToInstance(CreateSermonDto, {
          title: 'Sermon',
          sermonDate: '2026-10-25',
          audioUrl: url,
          videoUrl: url,
        }),
      ),
    ).toEqual([]);
  });
  it.each(['javascript:alert(1)', 'not a url', 'data:text/html,test', ''])(
    'rejects %s',
    async (url) => {
      const errors = await validate(
        plainToInstance(UpdateSermonDto, { audioUrl: url, videoUrl: url }),
      );
      expect(errors.map((error) => error.property).sort()).toEqual(['audioUrl', 'videoUrl']);
    },
  );
  it('accepts explicit nulls to clear recordings and omitted fields to preserve them', async () => {
    expect(
      await validate(plainToInstance(UpdateSermonDto, { audioUrl: null, videoUrl: null })),
    ).toEqual([]);
    expect(await validate(plainToInstance(UpdateSermonDto, { title: 'Updated title' }))).toEqual(
      [],
    );
  });
});
