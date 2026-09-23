import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('Migration and admin event tested with exported columns, constraints, triggers and RLS',async()=>{
 const db=new PGlite();
 try {
 await db.exec(read('./schema-export.sql'));
 await db.exec(read('../supabase/migrations/202609230001_fenix_persistencia.sql'));
 const uid='00000000-0000-4000-8000-000000000001';
 await db.query('insert into auth.users values ($1)',[uid]);
 await db.query("insert into perfis(id,nome,papel,status) values ($1,'Teste','admin','ativo')",[uid]);
 const mod=(await db.query("insert into modalidades(nome) values ('Teste') returning id")).rows[0].id;
 const turma=(await db.query("insert into turmas(nome,modalidade_id,dia_semana,horario) values ('Teste',$1,1,'18:00') returning id",[mod])).rows[0].id;
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 const save=(data)=>db.query("select fenix_salvar_registro('eventos',gen_random_uuid(),$1,0,null)",[JSON.stringify(data)]);
 await assert.rejects(save({nome:'Sem turma',data:'2026-10-10'}),/null value/i);
 await save({nome:'Evento',data:'2026-10-10',turma_id:turma});
 assert.equal((await db.query('select count(*)::int n from eventos')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from fenix_auditoria')).rows[0].n,1);
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query('select * from financeiro_atualizado'),/permission denied/);
 } finally {await db.close();}
});
