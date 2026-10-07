// PM2 설정 — Next.js 프로덕션 서버
// 실행:  pm2 start scripts/deploy/pm2.config.cjs
// 재시작: pm2 reload foodis
// 로그:   pm2 logs foodis

module.exports = {
  apps: [
    {
      name: 'foodis',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1, // 1코어 VPS 기본. 여러 코어면 'max' 로 바꾸거나 숫자 지정
      exec_mode: 'fork', // 'cluster' 로 바꿀 때는 Next 세션/캐시 공유 주의
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Next.js는 apps/web/.env.local 을 알아서 읽음.
      // GOOGLE_APPLICATION_CREDENTIALS 등 여기서 override 하고 싶으면 env 에 추가.
      error_file: '/var/log/foodis/error.log',
      out_file: '/var/log/foodis/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
