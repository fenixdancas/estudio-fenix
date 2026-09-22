import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

assert.ok(script, "O JavaScript principal não foi encontrado.");
new Function(script);

for (const file of ["logo-fenix.png", "logo-fenix-marca.png", "fenix-elemento.png"]) {
  assert.ok(fs.existsSync(path.join(root, file)), `Imagem ausente: ${file}`);
  assert.ok(html.includes(file), `Imagem não referenciada: ${file}`);
}

const requiredViews = [
  "painel", "alunos", "professores", "turmas", "presenca",
  "mensalidades", "contas", "financeiro", "eventos",
  "aniversarios", "busca", "historico", "config"
];

for (const view of requiredViews) {
  assert.ok(html.includes(`data-view="${view}"`), `Item do menu ausente: ${view}`);
  assert.ok(new RegExp(`(?:^|\\n)\\s*${view}:`).test(html), `Tela ausente: ${view}`);
}

assert.ok(html.includes('button.onclick=()=>go(button.dataset.view)'), "O menu não está ligado à navegação.");
assert.ok(html.includes('document.getElementById("logoutBtn").onclick=logout'), "O botão Sair não está ligado.");
assert.ok(!/data:image\/(?:png|jpeg|webp);base64/i.test(html), "Há imagem Base64 incorporada ao HTML.");
assert.ok(html.length < 250_000, "O index.html ultrapassou o limite de segurança de 250 KB.");

console.log("Validação concluída: estrutura, navegação, imagens e JavaScript estão íntegros.");
