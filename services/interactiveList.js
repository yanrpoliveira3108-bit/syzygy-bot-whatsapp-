// services/interactiveList.js
// [v51] CAMADA DE COMPATIBILIDADE — a implementação ÚNICA de listas interativas
// vive em services/list.js. Este arquivo existia como uma SEGUNDA implementação
// concorrente (enviava com messageId undefined = lista renderizada mas morta,
// usada pelas páginas de categoria cat_* do roteador) e foi o causador do
// "abre mas não seleciona". Agora apenas reexporta a fonte única.
export { sendInteractiveList, getListId, getInteractiveId, chunkRowsToSections, paginateRows } from "./list.js"
