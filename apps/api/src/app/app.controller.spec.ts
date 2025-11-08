import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeAll(() => {
    appController = new AppController();
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = appController.getHealth();
      expect(result).toEqual({ status: 'all is good' });
    });
  });
});
