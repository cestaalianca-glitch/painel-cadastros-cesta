const ESCOPO = "https://www.googleapis.com/auth/spreadsheets openid email profile";

let tokenClient = null;
let acessoToken = null;
let todosCadastros = [];
let sheetIdCache = null;
let filtroStatusAtual = "Todos";

function iniciar() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: ESCOPO,
    callback: aoReceberToken,
  });

  document.getElementById("btnEntrar").addEventListener("click", () => {
    tokenClient.requestAccessToken({ prompt: "select_account" });
  });

  document.getElementById("btnAtualizar").addEventListener("click", carregarCadastros);
  document.getElementById("busca").addEventListener("input", renderizarLista);

  document.querySelectorAll(".filtro-status-btn").forEach((botao) => {
    botao.addEventListener("click", () => {
      filtroStatusAtual = botao.dataset.status;
      document.querySelectorAll(".filtro-status-btn").forEach((b) => b.classList.remove("ativo"));
      botao.classList.add("ativo");
      renderizarLista();
    });
  });
}

async function aoReceberToken(resposta) {
  if (resposta.error) {
    document.getElementById("tela-negado").style.display = "block";
    document.getElementById("tela-negado").textContent =
      "Não foi possível entrar. Tente novamente.";
    return;
  }

  acessoToken = resposta.access_token;

  try {
    const perfil = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${acessoToken}` },
    }).then((r) => r.json());

    mostrarUsuarioLogado(perfil);
    document.getElementById("tela-login").style.display = "none";
    document.getElementById("conteudo-painel").style.display = "block";
    await carregarCadastros();
  } catch (erro) {
    document.getElementById("tela-negado").style.display = "block";
    document.getElementById("tela-negado").textContent =
      "Aconteceu um erro ao entrar. Tente novamente.";
  }
}

function mostrarUsuarioLogado(perfil) {
  const area = document.getElementById("areaUsuario");
  area.innerHTML = `
    <div class="usuario-logado">
      <img src="${perfil.picture}" alt="">
      <span>${perfil.name}</span>
      <button id="btnSair">Sair</button>
    </div>
  `;
  document.getElementById("btnSair").addEventListener("click", () => {
    google.accounts.oauth2.revoke(acessoToken, () => window.location.reload());
  });
}

const VENDEDORES = ["Pedro", "Kinka", "Luan", "Joao", "Juciano/Joaozinho", "Jayme"];

const STATUS_VENDEDOR_OPCOES = ["Enviado", "Aceitou", "Recusou"];

function numeroWhatsapp(c) {
  const bruto = c["Celular 1"] || c.Celular1 || c["Telefone 1"] || "";
  const digitos = bruto.replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

function textoCadastroFormatado(c) {
  const linhas = [
    `*${c.Nome || "(sem nome)"}*`,
    `CPF: ${c.CPF || "-"}`,
    `Telefone: ${c["Celular 1"] || c.Celular1 || "-"}`,
    `Endereço: ${c.Endereço || ""}, ${c.Número || ""} - ${c.Bairro || ""}, ${c.Cidade || ""} ${c.Estado || ""}`,
    `Cesta: ${c.Cesta || "-"} | Pagamento: ${c.Pagamento || "-"}`,
    `Moradia: ${c.SituacaoMoradia || "-"}${c.ValorAluguel ? ` (aluguel ${c.ValorAluguel})` : ""}`,
    `Trabalho: ${c.SituacaoTrabalho || "-"}`,
    `Renda da casa: ${c.Renda || "-"}`,
  ];
  if (c.ItensPersonalizados) linhas.push(`Itens personalizados: ${c.ItensPersonalizados}`);
  if (c.Observações) linhas.push(`Obs: ${c.Observações}`);
  return linhas.join("\n");
}

async function copiarCadastro(c, botao) {
  try {
    await navigator.clipboard.writeText(textoCadastroFormatado(c));
    const textoOriginal = botao.textContent;
    botao.textContent = "Copiado!";
    setTimeout(() => { botao.textContent = textoOriginal; }, 1800);
  } catch (erro) {
    alert("Não foi possível copiar: " + erro.message);
  }
}

async function carregarCadastros() {
  const intervalo = "A:AW";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${intervalo}`;

  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${acessoToken}` },
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    document.getElementById("listaCadastros").innerHTML =
      `<p style="color:#b00020;">Não foi possível carregar os cadastros agora (código ${resposta.status}).</p>
       <pre style="white-space:pre-wrap; background:#fdeaea; padding:10px; border-radius:6px; font-size:12px; color:#800;">${detalhe}</pre>`;
    return;
  }

  const dados = await resposta.json();
  const linhas = dados.values || [];
  if (linhas.length < 2) {
    todosCadastros = [];
    renderizarResumo();
    renderizarLista();
    return;
  }

  const cabecalhos = linhas[0];
  todosCadastros = linhas.slice(1).map((linha, i) => {
    const registro = {};
    cabecalhos.forEach((cabecalho, j) => {
      registro[cabecalho] = linha[j] || "";
    });
    registro._linha = i + 2; // linha real na planilha (1 = cabeçalho)
    registro.Status = registro.Status || "Pendente";
    return registro;
  }).reverse();

  renderizarResumo();
  renderizarLista();
}

async function obterSheetId() {
  if (sheetIdCache !== null) return sheetIdCache;
  const resposta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${acessoToken}` } }
  );
  const dados = await resposta.json();
  sheetIdCache = dados.sheets[0].properties.sheetId;
  return sheetIdCache;
}

async function definirStatus(linha, novoStatus) {
  try {
    const resposta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/AH${linha}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${acessoToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[novoStatus]] }),
      }
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      alert(`Não foi possível atualizar o status agora (código ${resposta.status}).\n${detalhe}`);
      return;
    }

    await carregarCadastros();
  } catch (erro) {
    alert("Erro ao atualizar status: " + erro.message);
  }
}

async function definirCampo(coluna, linha, valor, mensagemErro) {
  try {
    const resposta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${coluna}${linha}?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${acessoToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [[valor]] }),
      }
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      alert(`${mensagemErro} (código ${resposta.status}).\n${detalhe}`);
      return;
    }

    await carregarCadastros();
  } catch (erro) {
    alert(`${mensagemErro}: ${erro.message}`);
  }
}

async function definirVendedor(linha, vendedor) {
  await definirCampo("AU", linha, vendedor, "Não foi possível atribuir o vendedor agora");
}

async function definirStatusVendedor(linha, status) {
  await definirCampo("AV", linha, status, "Não foi possível atualizar o status do vendedor agora");
}

async function excluirRegistro(linha, nome) {
  const confirmado = confirm(
    `Excluir o cadastro de "${nome || "este cliente"}"?\nEssa ação não pode ser desfeita.`
  );
  if (!confirmado) return;

  try {
    const sheetId = await obterSheetId();
    const resposta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acessoToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: "ROWS",
                  startIndex: linha - 1,
                  endIndex: linha,
                },
              },
            },
          ],
        }),
      }
    );

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      alert(`Não foi possível excluir agora (código ${resposta.status}).\n${detalhe}`);
      return;
    }

    await carregarCadastros();
  } catch (erro) {
    alert("Erro ao excluir: " + erro.message);
  }
}

function renderizarResumo() {
  const hoje = new Date();
  const hojeStr = hoje.toLocaleDateString("pt-BR");

  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - 7);

  const cadastrosHoje = todosCadastros.filter((c) => (c.Data || "").startsWith(hojeStr)).length;
  const cadastrosSemana = todosCadastros.filter((c) => {
    const partes = (c.Data || "").split(" ")[0].split("/");
    if (partes.length !== 3) return false;
    const data = new Date(`${partes[2]}-${partes[1]}-${partes[0]}`);
    return data >= inicioSemana;
  }).length;

  const pendentes = todosCadastros.filter((c) => c.Status === "Pendente").length;

  document.getElementById("cardsResumo").innerHTML = `
    <div class="card">
      <div class="label">Total de Cadastros</div>
      <div class="value">${todosCadastros.length}</div>
    </div>
    <div class="card card-pendentes">
      <div class="label">Pendentes de análise</div>
      <div class="value">${pendentes}</div>
    </div>
    <div class="card">
      <div class="label">Hoje</div>
      <div class="value">${cadastrosHoje}</div>
    </div>
    <div class="card">
      <div class="label">Últimos 7 dias</div>
      <div class="value">${cadastrosSemana}</div>
    </div>
  `;
}

const CLASSE_STATUS = {
  Pendente: "status-pendente",
  Aprovado: "status-aprovado",
  Recusado: "status-recusado",
};

function validarCPF(cpf) {
  const digitos = (cpf || "").replace(/\D/g, "");
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (fatiaTamanho) => {
    let soma = 0;
    for (let i = 0; i < fatiaTamanho; i++) {
      soma += parseInt(digitos[i], 10) * (fatiaTamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return (
    calcularDigito(9) === parseInt(digitos[9], 10) &&
    calcularDigito(10) === parseInt(digitos[10], 10)
  );
}

function calcularScore(c) {
  const motivos = [];
  let pontos = 0;
  let maximo = 0;

  maximo += 25;
  if (validarCPF(c.CPF)) {
    pontos += 25;
  } else {
    motivos.push("CPF com formato inválido");
  }

  maximo += 15;
  const renda = parseFloat((c.Renda || "").replace(/[^\d,]/g, "").replace(",", "."));
  if (c.Renda && !isNaN(renda) && renda > 0) {
    pontos += 15;
  } else {
    motivos.push("Renda não informada");
  }

  maximo += 15;
  const moradiaEstavel = ["Própria", "Financiada"].includes(c.SituacaoMoradia);
  const moradiaLegado = !c.SituacaoMoradia && c["Possui Imóvel"] === "Sim";
  if (moradiaEstavel || moradiaLegado) pontos += 15;

  maximo += 10;
  if (c["Possui Veículo"] === "Sim") pontos += 10;

  maximo += 20;
  const enderecoCompleto = c.Endereço && c.Número && c.Bairro && c.Cidade;
  if (enderecoCompleto) {
    pontos += 20;
  } else {
    motivos.push("Endereço incompleto");
  }

  maximo += 15;
  const temTelefone = c["Celular 1"] || c.Celular1 || c["Telefone 1"];
  if (temTelefone) {
    pontos += 15;
  } else {
    motivos.push("Sem telefone de contato");
  }

  const percentual = Math.round((pontos / maximo) * 100);
  let nivel = "Baixo";
  if (percentual >= 70) nivel = "Alto";
  else if (percentual >= 40) nivel = "Médio";

  return { percentual, nivel, motivos };
}

function campo(label, valor) {
  return `<div class="campo"><span class="campo-label">${label}</span><span class="campo-valor">${valor || "-"}</span></div>`;
}

function detalheTrabalho(c) {
  switch (c.SituacaoTrabalho) {
    case "Registrado (CLT)":
      return [
        campo("Empresa", c.Empresa),
        campo("Cargo/Função", c.CargoClt),
        campo("Admissão", c["Data Admissão"]),
      ].join("");
    case "Benefício/Aposentadoria":
      return campo("Tipo de benefício", c.TipoBeneficio);
    case "Diarista/Informal":
      return [campo("Ocupação", c.OcupacaoDiarista), campo("Recebe por", c.FrequenciaPagamento)].join("");
    case "Do lar":
      return campo("Ocupação do cônjuge", c.OcupacaoConjuge);
    default:
      return "";
  }
}

function renderizarLista() {
  const termo = document.getElementById("busca").value.trim().toLowerCase();
  const filtrados = todosCadastros.filter((c) => {
    if (filtroStatusAtual !== "Todos" && c.Status !== filtroStatusAtual) return false;
    if (!termo) return true;
    return [c.Nome, c.Cidade, c.Bairro, c.Celular1, c["Celular 1"], c.CPF]
      .join(" ")
      .toLowerCase()
      .includes(termo);
  });

  document.getElementById("contagem").textContent = `${filtrados.length} cadastro(s)`;

  if (filtrados.length === 0) {
    document.getElementById("listaCadastros").innerHTML =
      '<p class="lista-vazia">Nenhum cadastro encontrado.</p>';
    return;
  }

  document.getElementById("listaCadastros").innerHTML = filtrados.map((c) => {
    const score = calcularScore(c);
    const zap = numeroWhatsapp(c);
    const vendedorAtual = c.VendedorAtribuido || "";
    const statusVendedorAtual = c.StatusVendedor || "";

    return `
    <div class="cartao-registro">
      <div class="cartao-registro-topo">
        <span class="cartao-registro-nome">${c.Nome || "(sem nome)"}</span>
        <span class="selo-status ${CLASSE_STATUS[c.Status] || "status-pendente"}">${c.Status}</span>
        <span class="selo-score selo-score-${score.nivel.toLowerCase()}" title="${score.motivos.join(" · ") || "Sem pendências nos dados"}">Confiança: ${score.nivel} (${score.percentual}%)</span>
        <span class="cartao-registro-data">${c.Data || ""}</span>
      </div>
      ${score.motivos.length ? `<div class="cartao-registro-alerta">⚠ ${score.motivos.join(" · ")}</div>` : ""}
      ${c.PossivelClienteOpy ? `<div class="cartao-registro-alerta cartao-registro-alerta-opy">🔎 Possível cliente já existente no Opy: ${c.PossivelClienteOpy}</div>` : ""}
      ${c.ItensPersonalizados ? `<div class="cartao-registro-alerta cartao-registro-alerta-itens">🧺 Cesta personalizada: ${c.ItensPersonalizados}</div>` : ""}

      <div class="cartao-registro-linha">
        <b>Telefone:</b> ${c["Celular 1"] || c.Celular1 || "-"}
        ${zap ? `<a class="link-whatsapp" href="https://wa.me/${zap}" target="_blank" rel="noopener">Abrir WhatsApp ↗</a>` : ""}
      </div>
      <div class="cartao-registro-linha"><b>Endereço:</b> ${c.Endereço || ""}, ${c.Número || ""} - ${c.Bairro || ""}, ${c.Cidade || ""} ${c.Estado || ""}</div>
      <div class="cartao-registro-linha"><b>Cesta:</b> <span class="selo-cesta">${c.Cesta || "-"}</span> &nbsp; <b>Pagamento:</b> ${c.Pagamento || "-"}</div>

      <div class="cartao-registro-resumo-socio">
        <div class="bloco-socio">
          <span class="bloco-socio-titulo">Moradia</span>
          <span>${c.SituacaoMoradia || "-"}${c.ValorAluguel ? ` · aluguel ${c.ValorAluguel}` : ""}</span>
          <span class="bloco-socio-sub">${c.TempoMoradia ? `Mora há ${c.TempoMoradia}` : ""}</span>
        </div>
        <div class="bloco-socio">
          <span class="bloco-socio-titulo">Trabalho</span>
          <span>${c.SituacaoTrabalho || "-"}</span>
          <span class="bloco-socio-sub">${[c.CargoClt, c.TipoBeneficio, c.OcupacaoDiarista, c.OcupacaoConjuge].filter(Boolean).join(" · ")}</span>
        </div>
        <div class="bloco-socio">
          <span class="bloco-socio-titulo">Renda da casa</span>
          <span>${c.Renda || "-"}</span>
          <span class="bloco-socio-sub">${c.PessoasCasa ? `${c.PessoasCasa} pessoas na casa${c.PessoasComRenda ? `, ${c.PessoasComRenda} com renda` : ""}` : ""}</span>
        </div>
      </div>

      <details>
        <summary>Ver todos os dados</summary>
        <div class="detalhes-secoes">
          <div class="detalhes-secao">
            <h4>Dados pessoais</h4>
            <div class="grade-campos">
              ${campo("CPF", c.CPF)}
              ${campo("RG", c.RG)}
              ${campo("Nascimento", c.Nascimento)}
              ${campo("Estado civil", c["Estado Civil"])}
              ${campo("Nome do pai", c.Pai)}
              ${campo("Nome da mãe", c.Mãe)}
            </div>
          </div>
          <div class="detalhes-secao">
            <h4>Endereço</h4>
            <div class="grade-campos">
              ${campo("CEP", c.CEP)}
              ${campo("Complemento", c.Complemento)}
            </div>
          </div>
          <div class="detalhes-secao">
            <h4>Trabalho — detalhe</h4>
            <div class="grade-campos">
              ${detalheTrabalho(c) || campo("Detalhe", "-")}
            </div>
          </div>
          <div class="detalhes-secao">
            <h4>Contato adicional</h4>
            <div class="grade-campos">
              ${campo("Celular 2", c["Celular 2"])}
              ${campo("Telefone 1", c["Telefone 1"])}
              ${campo("Telefone 2", c["Telefone 2"])}
              ${campo("Melhor horário", c["Melhor Horário"])}
            </div>
          </div>
          <div class="detalhes-secao">
            <h4>Origem</h4>
            <div class="grade-campos">
              ${campo("Como conheceu", c["Como Conheceu"])}
              ${campo("Quem indicou", c["Quem Indicou"])}
            </div>
          </div>
          ${c.Observações ? `<div class="detalhes-secao"><h4>Observações</h4><p class="observacoes-texto">${c.Observações}</p></div>` : ""}
        </div>
      </details>

      <div class="cartao-registro-rodape">
        <div class="rodape-vendedor">
          <label>
            Vendedor
            <select class="select-vendedor" data-linha="${c._linha}">
              <option value="" ${vendedorAtual === "" ? "selected" : ""}>Sem atribuição</option>
              ${VENDEDORES.map((v) => `<option value="${v}" ${vendedorAtual === v ? "selected" : ""}>${v}</option>`).join("")}
            </select>
          </label>
          ${vendedorAtual ? `
          <div class="botoes-status-vendedor">
            ${STATUS_VENDEDOR_OPCOES.filter((s) => s !== statusVendedorAtual).map((s) =>
              `<button class="btn-acao btn-sv btn-sv-${s.toLowerCase()}" data-linha="${c._linha}" data-svstatus="${s}">${s}</button>`
            ).join("")}
            ${statusVendedorAtual ? `<span class="selo-status-vendedor sv-${statusVendedorAtual.toLowerCase()}">${statusVendedorAtual}</span>` : ""}
          </div>` : ""}
        </div>
        <div class="rodape-acoes">
          <button class="btn-acao btn-copiar" data-linha="${c._linha}">Copiar cadastro</button>
          ${c.Status !== "Aprovado" ? `<button class="btn-acao btn-aprovar" data-linha="${c._linha}" data-status="Aprovado">Aprovar</button>` : ""}
          ${c.Status !== "Recusado" ? `<button class="btn-acao btn-recusar" data-linha="${c._linha}" data-status="Recusado">Recusar</button>` : ""}
          ${c.Status !== "Pendente" ? `<button class="btn-acao btn-pendente" data-linha="${c._linha}" data-status="Pendente">Voltar para pendente</button>` : ""}
          <button class="btn-acao btn-excluir-registro" data-linha="${c._linha}" data-nome="${(c.Nome || "").replace(/"/g, "&quot;")}">Excluir cadastro</button>
        </div>
      </div>
    </div>
  `;
  }).join("");

  document.querySelectorAll(".btn-aprovar, .btn-recusar, .btn-pendente").forEach((botao) => {
    botao.addEventListener("click", () => {
      definirStatus(Number(botao.dataset.linha), botao.dataset.status);
    });
  });

  document.querySelectorAll(".btn-excluir-registro").forEach((botao) => {
    botao.addEventListener("click", () => {
      excluirRegistro(Number(botao.dataset.linha), botao.dataset.nome);
    });
  });

  document.querySelectorAll(".btn-copiar").forEach((botao) => {
    botao.addEventListener("click", () => {
      const registro = todosCadastros.find((c) => c._linha === Number(botao.dataset.linha));
      if (registro) copiarCadastro(registro, botao);
    });
  });

  document.querySelectorAll(".select-vendedor").forEach((select) => {
    select.addEventListener("change", () => {
      definirVendedor(Number(select.dataset.linha), select.value);
    });
  });

  document.querySelectorAll(".btn-sv").forEach((botao) => {
    botao.addEventListener("click", () => {
      definirStatusVendedor(Number(botao.dataset.linha), botao.dataset.svstatus);
    });
  });
}

window.addEventListener("load", () => {
  const esperarGoogle = setInterval(() => {
    if (window.google && google.accounts) {
      clearInterval(esperarGoogle);
      iniciar();
    }
  }, 100);
});
