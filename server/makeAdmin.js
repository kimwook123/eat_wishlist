import { database } from './database.js'
const username = process.argv[2]?.trim().toLowerCase()
if (!username) { console.error('사용법: npm run make-admin -- 사용자아이디'); process.exitCode = 1 }
else {
  const result = database.prepare("UPDATE users SET role='admin' WHERE username=?").run(username)
  if (!result.changes) { console.error(`사용자를 찾을 수 없습니다: ${username}`); process.exitCode = 1 }
  else console.log(`${username} 계정에 관리자 권한을 부여했습니다.`)
}
database.close()
