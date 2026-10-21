# Lory's Care - demo

Demo interativa do **Lory's Care**, aplicação que centraliza a rotina de cuidados de uma pessoa idosa: sinais vitais, medicamentos, atividades, agenda, plantões e anotações de enfermagem.

**Ver a demo:** https://nathansouza-hub.github.io/loryscare-demo/

- Login: `demo@loryscare.dev` / `demo1234`
- PIN dos cuidadores: `1234`

## Como funciona

A demo roda **o back-end real do projeto dentro do navegador**, sem servidor:

- `demo/servidor.js` é o `app.js` original (Express, serviços, repositórios e validações) empacotado com esbuild. O Express foi trocado por um roteador mínimo compatível e o `pg` por um adaptador para o [PGlite](https://pglite.dev), o PostgreSQL compilado para WebAssembly.
- `demo/migracoes.js` contém as migrations reais do projeto, executadas no PGlite na primeira visita.
- `demo/semear.js` cria a paciente e os dados de exemplo (todos fictícios) chamando a própria API.
- `demo/demo.js` intercepta as chamadas do front-end para `/api/...` e entrega ao servidor da demo.

O banco fica no IndexedDB do seu navegador. O botão "Restaurar dados" apaga tudo e recomeça. A primeira visita leva alguns segundos para baixar o PostgreSQL e criar o banco.

Código completo: https://github.com/NathanSouza-hub/Loryscare
