import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractJatsArticleText,
  extractJatsLicense,
  identifierDiff,
  prepareSelectedSources,
} from '../researchGate2Sources';

describe('Gate 2 Europe PMC reduction', () => {
  it('reduces JATS to article title, abstract and body paragraphs', () => {
    const xml = `
      <article>
        <front>
          <article-title>Canine study</article-title>
          <abstract><p>Abstract text.</p></abstract>
        </front>
        <body><sec><title>Methods</title><p>Dogs were enrolled.</p></sec></body>
      </article>`;
    assert.equal(
      extractJatsArticleText(xml),
      'Canine study\n\nAbstract text.\n\nMethods\n\nDogs were enrolled.',
    );
  });

  it('retains a structured JATS license value', () => {
    assert.equal(
      extractJatsLicense('<license license-type="CC BY"><license-p>text</license-p></license>'),
      'CC BY',
    );
  });

  it('uses a PubMed abstract without inventing OA funding metadata', async () => {
    const fetchImpl = (async () =>
      new Response(`
        <PubmedArticleSet><PubmedArticle><MedlineCitation>
          <PMID>1</PMID><Article><ArticleTitle>Canine abstract</ArticleTitle>
          <Abstract><AbstractText>Dogs were studied.</AbstractText></Abstract>
          <Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
          <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>
          </Article><MeshHeadingList><MeshHeading><DescriptorName>Dogs</DescriptorName></MeshHeading></MeshHeadingList>
        </MedlineCitation><PubmedData><ArticleIdList></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>
      `, { status: 200 })) as typeof fetch;
    const prepared = await prepareSelectedSources([{
      source_id: 'MED:1',
      title: 'Canine abstract',
      doi: null,
      pmid: '1',
      pmcid: null,
      journal: 'Journal',
      publication_year: 2024,
      source_url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
      full_text_url: null,
      open_access: false,
      abstract_only: true,
      evidence_grade: 'D',
      evidence_scope: 'canine_direct',
      study_design: 'other',
      species: 'dog',
      species_terms: ['Dogs'],
      mesh_headings: ['Dogs'],
      sample_size: null,
      funding_declaration: null,
      competing_interests_declaration: null,
      funding_independent: null,
      is_preprint: false,
      retracted: false,
      grading_inputs_complete: true,
      missing_grading_inputs: [],
      topic_memberships: [{ key: 'x', group: 'A', label: 'x', query: 'x' }],
    }], fetchImpl);
    assert.equal(prepared[0].content_source, 'pubmed_abstract');
    assert.equal(prepared[0].plain_text, 'Canine abstract\n\nDogs were studied.');
    assert.equal(prepared[0].funding_declaration, null);
    assert.equal(prepared[0].source_access_note, null);
  });

  it('falls back to the same PMID abstract when frozen OA JATS returns 404', async () => {
    let request = 0;
    const fetchImpl = (async () => {
      request += 1;
      if (request === 1) {
        return new Response(`
          <PubmedArticleSet><PubmedArticle><MedlineCitation>
            <PMID>1</PMID><Article><ArticleTitle>Canine OA paper</ArticleTitle>
            <Abstract><AbstractText>Dogs were studied.</AbstractText></Abstract>
            <Journal><Title>Journal</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
            <PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>
            </Article><MeshHeadingList><MeshHeading><DescriptorName>Dogs</DescriptorName></MeshHeading></MeshHeadingList>
          </MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pmc">PMC1</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>
        `, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    const prepared = await prepareSelectedSources([{
      source_id: 'MED:1',
      title: 'Canine OA paper',
      doi: null,
      pmid: '1',
      pmcid: 'PMC1',
      journal: 'Journal',
      publication_year: 2024,
      source_url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
      full_text_url: 'https://europepmc.org/articles/PMC1',
      open_access: true,
      abstract_only: false,
      evidence_grade: 'D',
      evidence_scope: 'canine_direct',
      study_design: 'other',
      species: 'dog',
      species_terms: ['Dogs'],
      mesh_headings: ['Dogs'],
      sample_size: null,
      funding_declaration: null,
      competing_interests_declaration: null,
      funding_independent: null,
      is_preprint: false,
      retracted: false,
      grading_inputs_complete: true,
      missing_grading_inputs: [],
      topic_memberships: [{ key: 'x', group: 'A', label: 'x', query: 'x' }],
    }], fetchImpl);
    assert.equal(prepared[0].content_source, 'pubmed_abstract');
    assert.match(prepared[0].source_access_note ?? '', /fullTextXML returned HTTP 404/);
    assert.equal(request, 2, 'a non-retryable 404 must not be retried');
  });

  it('reports a newly appearing PMCID as identifier drift', () => {
    const manifest = {
      pmid: '1',
      doi: null,
      pmcid: null,
    } as Parameters<typeof identifierDiff>[0];
    const pubmed = {
      pmid: '1',
      doi: null,
      pmcid: 'PMC1',
    } as Parameters<typeof identifierDiff>[1];
    assert.deepEqual(identifierDiff(manifest, pubmed), [
      'PMCID report=null current=PMC1',
    ]);
  });
});
