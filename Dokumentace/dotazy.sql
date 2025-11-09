SELECT 
  ew.id                                  AS "zapis_id",
  ew.name                                AS "zapis",
  b.id                                   AS "blok_id",
  b.name                                 AS "blok",
  s.id                                   AS "predmet_id",
  s.name                                 AS "predmet",
  so.id                                  AS "vyskyt_id",
  so."subCode"                           AS "skupina",
  "u"."firstName" || ' ' || "u"."lastName" AS "ucitel",
  so.capacity                            AS "kapacita_max",
  COUNT(se.id)                           AS "zapsano",
  CASE 
    WHEN so.capacity IS NULL THEN NULL
    ELSE (so.capacity - COUNT(se.id))
  END                                    AS "volna_mista"
FROM "EnrollmentWindow" ew
JOIN "Block" b ON b."enrollmentWindowId" = ew.id
JOIN "SubjectOccurrence" so ON so."blockId" = b.id
JOIN "Subject" s ON s.id = so."subjectId"
JOIN "User" "u" ON "u".id = so."teacherId"
LEFT JOIN "StudentEnrollment" se ON se."subjectOccurrenceId" = so.id
WHERE ew.status = 'OPEN'
GROUP BY 
  ew.id, ew.name,
  b.id, b.name,
  s.id, s.name,
  so.id, so."subCode", so.capacity,
  "u"."firstName", "u"."lastName",
  b."order"
ORDER BY 
  ew.name,
  b."order",
  s.name,
  so."subCode";
