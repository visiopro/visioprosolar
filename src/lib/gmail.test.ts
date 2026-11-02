import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cifrar,decifrar,iguais,validarRemetentes,validarAssuntos,assuntoConfere,consultaGmail,anexosPdf,ehPdf,pdfProtegido,hash} from './gmail/seguranca.ts';

test('Gmail: credencial cifrada só abre com a chave e usina corretas',()=>{
 const key=randomBytes(32), token=cifrar('refresh-token-ficticio','usina-a',key);
 assert.equal(decifrar(token,'usina-a',key),'refresh-token-ficticio');
 assert.throws(()=>decifrar(token,'usina-b',key));
 assert.throws(()=>decifrar(token,'usina-a',randomBytes(32)));
 const partes=token.split('.');partes[2]=Buffer.alloc(16).toString('base64url');
 assert.throws(()=>decifrar(partes.join('.'),'usina-a',key));
 assert.notEqual(cifrar('refresh-token-ficticio','usina-a',key),token);
});
test('Gmail: comparação rejeita estado vazio, diferente e multibyte',()=>{
 assert.equal(iguais('abc','abc'),true);assert.equal(iguais('abc','abd'),false);
 assert.equal(iguais('',''),false);assert.equal(iguais('é','x'),false);
});
test('Gmail: filtro exige remetentes completos, sem injeção de consultas',()=>{
 assert.deepEqual(validarRemetentes('CONTAS@example.com; contas@example.com'),['contas@example.com']);
 for(const v of ['', 'coelba', 'a@b.com OR in:anywhere','a@b.com\"','@example.com']) assert.throws(()=>validarRemetentes(v));
 const q=consultaGmail(['contas@example.com'],'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z');
 assert.match(q,/^\{from:contas@example.com\} has:attachment filename:pdf after:\d+ before:\d+$/);
});
test('Gmail: acha PDFs em MIME aninhado e ignora logos e links',()=>{
 const r=anexosPdf({parts:[{mimeType:'text/html',body:{data:'abc'}},{parts:[{filename:'CONTA.PDF',body:{attachmentId:'1'}},{filename:'logo.png',body:{attachmentId:'2'}},{filename:'vazio.pdf',body:{}}]}]});
 assert.equal(r.length,1);assert.equal(r[0].body?.attachmentId,'1');
});
test('Gmail: valida assinatura PDF e reconhece criptografia',()=>{
 const pdf=Buffer.from('%PDF-1.7\n/Encrypt 12 0 R\n%%EOF');
 assert.ok(ehPdf(pdf));assert.ok(pdfProtegido(pdf));
 assert.ok(!ehPdf(Buffer.from('<html>falha</html>')));
 assert.ok(!pdfProtegido(Buffer.from('%PDF-1.7\n/EncryptedWord\n%%EOF')));
 assert.equal(hash(pdf),hash(Buffer.from(pdf)));assert.notEqual(hash(pdf),hash(Buffer.from('outro')));
});
test('Gmail: filtro por assunto, sozinho ou junto com remetente',()=>{
 assert.deepEqual(validarAssuntos('Conta de energia, coelba'),['Conta de energia','coelba']);
 for(const v of ['ab','x" OR in:anywhere','{a}','OR','a:b']) assert.throws(()=>validarAssuntos(v));
 const q=consultaGmail([],'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z',['Conta de energia']);
 assert.match(q,/^\{subject:"Conta de energia"\} has:attachment filename:pdf/);
 const q2=consultaGmail(['contas@example.com'],'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z',['coelba']);
 assert.match(q2,/^\{from:contas@example.com subject:"coelba"\}/);
 assert.throws(()=>consultaGmail([],'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z',[]));
 assert.ok(assuntoConfere('Fwd: CONTA DE ENERGIA - outubro','conta de energia'.split(',')));
 assert.ok(assuntoConfere('Sua fatura Coelba chegou',['coelba']));
 assert.ok(!assuntoConfere('Promoção',['coelba']));
});
