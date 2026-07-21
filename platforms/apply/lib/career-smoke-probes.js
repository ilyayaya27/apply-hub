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
  {
    platformId: 'getmatch',
    url: 'https://getmatch.ru/vacancies/34997-frontend-razrabotchik-v-komandu-crm',
  },
  { platformId: 'djinni', url: 'https://djinni.co/jobs/811522-front-end-developer/' },
  {
    platformId: 'moysklad_careers',
    url: 'https://www.moysklad.ru/company/careers/vacancy/senior-developer-bitrix/',
  },
  // TBD: tbank — SPA с lazy vacancy URLs, нужен ручной probe URL
  // TBD: habr_career — требует login-once (интерактивный, ручной)
  // hirehi — apply требует регистрацию/логин (клик "Откликнуться" → "Доступно после регистрации"), не добавлять как probe
  // jobrockets — DNS dead (NXDOMAIN), деприкейтед, см. hosts.js/specs.js/sources.yaml
  // alfabank_careers — job.alfabank.ru: 0 IT-вакансий сейчас, нет форм/индивидуальных ссылок на вакансию — lead-gen страница, не apply-форма
];
