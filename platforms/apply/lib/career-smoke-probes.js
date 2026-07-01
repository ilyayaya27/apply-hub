/** Probe vacancy URLs for career-smoke --all (update as we validate). */
export const CAREER_SMOKE_PROBES = [
  { platformId: 'vk_careers', url: 'https://internship.vk.company/vacancy/1374' },
  { platformId: 'rwb_careers', url: 'https://career.rwb.ru/vacancies/25895' },
  {
    platformId: 'yandex_careers',
    url: 'https://yandex.ru/jobs/vacancies/razrabotchik-interfeysov-v-igri-46538',
  },
  {
    platformId: 'ozon_careers',
    url: 'https://career.ozon.ru/vacancy/ml-inzhener-133392771',
  },
  {
    platformId: 'avito_careers',
    url: 'https://career.avito.com/vacancies/razrabotka/19604/',
  },
  {
    platformId: 'sber_careers',
    url: 'https://rabota.sber.ru/search/frontend-razrabotchik-react-4508788/',
  },
  { platformId: 'cloudru_careers', url: 'https://cloud.ru/career/vacancies/2829875' },
  {
    platformId: 'beeline_careers',
    url: 'https://job.beeline.ru/vacancies/08f545ed-c711-4ea9-845d-067f69f045c6',
  },
  // TBD: tbank — SPA с lazy vacancy URLs, нужен ручной probe URL
  // TBD: habr_career, djinni — требуют login-once
  // TBD: getmatch, hirehi, jobrockets
  // TBD: alfabank_careers, moysklad_careers — form не найдена (возможно, за логином)
];
