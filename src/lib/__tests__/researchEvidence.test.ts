import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyFundingIndependence,
  computeEvidenceGrade,
  extractJatsFundingMetadata,
  missingGradingInputs,
  parsePubMedXml,
  studyDesignFromPubMed,
} from '../researchEvidence';

test('computed evidence grading produces A-E deterministically', () => {
  assert.equal(computeEvidenceGrade({
    study_design: 'systematic_review',
    species: 'dog',
    sample_size: null,
    funding_independent: null,
    is_preprint: false,
  }), 'A');
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: 40,
    funding_independent: true,
    is_preprint: false,
  }), 'B');
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: 40,
    funding_independent: false,
    is_preprint: false,
  }), 'C');
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: 40,
    funding_independent: true,
    is_preprint: true,
  }), 'D');
  assert.equal(computeEvidenceGrade({
    study_design: 'systematic_review',
    species: 'human',
    sample_size: 400,
    funding_independent: true,
    is_preprint: false,
  }), 'E');
});

test('unknown metadata does not masquerade as a negative finding', () => {
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: null,
    funding_independent: true,
    is_preprint: false,
  }), 'B');
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: 30,
    funding_independent: null,
    is_preprint: false,
  }), 'B');
});

test('known small samples and industry funding apply explicit downgrades', () => {
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: 19,
    funding_independent: true,
    is_preprint: false,
  }), 'C');
  assert.equal(computeEvidenceGrade({
    study_design: 'rct',
    species: 'dog',
    sample_size: null,
    funding_independent: false,
    is_preprint: false,
  }), 'C');
  assert.equal(computeEvidenceGrade({
    study_design: 'cohort',
    species: 'dog',
    sample_size: 12,
    funding_independent: true,
    is_preprint: false,
  }), 'D');
});

test('metadata completeness is represented separately from the grade', () => {
  const input = {
    study_design: 'rct' as const,
    species: 'dog' as const,
    sample_size: null,
    funding_independent: null,
    is_preprint: false,
  };
  assert.equal(computeEvidenceGrade(input), 'B');
  assert.deepEqual(
    missingGradingInputs(input),
    ['sample_size', 'funding_independent'],
  );
});

test('metadata irrelevant to a grade branch is not reported as missing', () => {
  assert.deepEqual(missingGradingInputs({
    study_design: 'systematic_review',
    species: 'dog',
    sample_size: null,
    funding_independent: null,
    is_preprint: false,
  }), []);
  assert.deepEqual(missingGradingInputs({
    study_design: 'narrative_review',
    species: 'dog',
    sample_size: null,
    funding_independent: null,
    is_preprint: false,
  }), []);
});

test('PubMed publication types map without model inference', () => {
  assert.equal(studyDesignFromPubMed(['Systematic Review'], []), 'systematic_review');
  assert.equal(studyDesignFromPubMed(['Meta-Analysis'], []), 'meta_analysis');
  assert.equal(studyDesignFromPubMed(['Randomized Controlled Trial'], []), 'rct');
  assert.equal(studyDesignFromPubMed(['Comparative Study'], []), 'comparative_study');
  assert.equal(studyDesignFromPubMed(['Case Reports'], []), 'case_series');
  assert.equal(studyDesignFromPubMed(['Review'], []), 'narrative_review');
});

test('PubMed XML supplies publication types, MeSH, DOI and PMCID', () => {
  const xml = `<?xml version="1.0"?>
    <PubmedArticleSet>
      <PubmedArticle>
        <MedlineCitation>
          <PMID>12345</PMID>
          <Article>
            <Journal>
              <JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue>
              <Title>Veterinary Journal</Title>
            </Journal>
            <ArticleTitle>Diet trial in <i>dogs</i>.</ArticleTitle>
            <Abstract><AbstractText Label="METHODS">Structured abstract text.</AbstractText></Abstract>
            <PublicationTypeList>
              <PublicationType>Randomized Controlled Trial</PublicationType>
              <PublicationType>Journal Article</PublicationType>
            </PublicationTypeList>
          </Article>
          <MeshHeadingList>
            <MeshHeading><DescriptorName>Dogs</DescriptorName></MeshHeading>
          </MeshHeadingList>
        </MedlineCitation>
        <PubmedData><ArticleIdList>
          <ArticleId IdType="doi">10.1000/TEST</ArticleId>
          <ArticleId IdType="pmc">PMC123</ArticleId>
        </ArticleIdList></PubmedData>
      </PubmedArticle>
    </PubmedArticleSet>`;
  const record = parsePubMedXml(xml).get('12345');
  assert.equal(record?.title, 'Diet trial in dogs .');
  assert.equal(record?.journal, 'Veterinary Journal');
  assert.equal(record?.publication_year, 2025);
  assert.equal(record?.doi, '10.1000/test');
  assert.equal(record?.pmcid, 'PMC123');
  assert.deepEqual(record?.publication_types, [
    'Randomized Controlled Trial',
    'Journal Article',
  ]);
  assert.deepEqual(record?.mesh_headings, ['Dogs']);
});

test('JATS funding and competing-interest text is retained and classified deterministically', () => {
  const xml = `<article>
    <funding-group><funding-statement>This work was supported by the University of Example.</funding-statement></funding-group>
    <fn-group><fn fn-type="COI"><p>The authors declare no competing interests.</p></fn></fn-group>
  </article>`;
  const metadata = extractJatsFundingMetadata(xml);
  assert.equal(
    metadata.funding_declaration,
    'This work was supported by the University of Example.',
  );
  assert.equal(
    metadata.competing_interests_declaration,
    'The authors declare no competing interests.',
  );
  assert.equal(
    classifyFundingIndependence(
      metadata.funding_declaration,
      metadata.competing_interests_declaration,
    ),
    true,
  );
  assert.equal(
    classifyFundingIndependence(
      'This work was funded by Mars Petcare.',
      'The authors declare no competing interests.',
    ),
    false,
  );
  assert.equal(classifyFundingIndependence(null, 'No competing interests.'), null);
});

test('JATS competing-interest sections are retained when publishers do not use fn-group', () => {
  const metadata = extractJatsFundingMetadata(`
    <article>
      <back>
        <ack>
          <sec sec-type="COI-statement">
            <title>Competing interests</title>
            <p>The authors declare that they have no financial or personal relationships.</p>
          </sec>
        </ack>
      </back>
    </article>
  `);

  assert.equal(
    metadata.competing_interests_declaration,
    'Competing interests The authors declare that they have no financial or personal relationships.',
  );
  assert.equal(metadata.funding_declaration, null);
});
