import { createZip, safeFileName } from './download-zip';

const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const officeRelationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';

const xmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function textRun(text: string) {
  // Drop characters XML 1.0 cannot represent, while retaining accents and other Unicode text.
  const escaped = text
    .replace(/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/[&<>]/g, char => xmlEntities[char]);
  return '<w:r>' + escaped.split('\t').map(part =>
    '<w:t xml:space="preserve">' + part + '</w:t>').join('<w:tab/>') + '</w:r>';
}

function paragraph(text: string, properties = '') {
  return '<w:p>' + (properties ? '<w:pPr>' + properties + '</w:pPr>' : '') +
    (text ? textRun(text) : '') + '</w:p>';
}

function xmlPart(name: string, content: string) {
  return { name, preservePath: true, blob: new Blob(['<?xml version="1.0" encoding="UTF-8"?>', content]) };
}

/** Package editable Word text with a print layout using the existing ZIP writer. */
export async function createReelScriptDocx(title: string, clients: string, script: string) {
  const heading = title.trim();
  const lines = script.replace(/\r\n?/g, '\n').split('\n');
  const body = [
    paragraph(heading || 'Guion del reel', '<w:pStyle w:val="Title"/>'),
    clients.trim() ? paragraph(clients.trim(), '<w:pStyle w:val="Subtitle"/>') : '',
    ...lines.map((line, index) => {
      // Keep the start of a scene (blocks separated by a blank line) next to its text.
      const startsBlock = line.trim() && !lines[index - 1]?.trim() && lines[index + 1]?.trim();
      return paragraph(line, startsBlock ? '<w:keepNext/>' : '');
    }),
  ].join('');
  const zip = await createZip([
    xmlPart('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="' + mime + '.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>'),
    xmlPart('_rels/.rels', '<Relationships xmlns="' + packageRelationships + '">' +
      '<Relationship Id="rId1" Type="' + officeRelationships + '/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'),
    xmlPart('word/document.xml', '<w:document xmlns:w="' + word + '"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' + // A4, in twentieths of a point.
      '<w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="0" w:footer="0" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>'),
    xmlPart('word/_rels/document.xml.rels', '<Relationships xmlns="' + packageRelationships + '">' +
      '<Relationship Id="rId1" Type="' + officeRelationships + '/styles" Target="styles.xml"/>' +
      '</Relationships>'),
    xmlPart('word/styles.xml', '<w:styles xmlns:w="' + word + '">' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '<w:pPr><w:widowControl/><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>' +
      '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="000000"/>' +
      '<w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="es-AR"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
      '<w:pPr><w:keepNext/><w:spacing w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
      '<w:pPr><w:keepNext/><w:spacing w:after="280"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>' +
      '</w:styles>'),
  ]);
  return new File([zip], safeFileName(heading ? heading + ' - Guion' : 'Guion del reel') + '.docx', { type: mime });
}
