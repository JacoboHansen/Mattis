-- Keep the learner's course selection constrained to the current Mattis catalogue.
-- MAT01-05 and 1T-Y/2T-Y remain accepted for profiles created under older plans,
-- but new UI selections use the current course catalogue in the web app.
alter table public.learner_profiles
  drop constraint if exists learner_profiles_course_code_check,
  add constraint learner_profiles_course_code_check
    check (
      course_code is null or course_code in (
        'MAT01-05', 'MAT01-06',
        '1P', '1T', '1P-Y', '1T-Y',
        '2P', '2P-Y', '2T-Y',
        'S1', 'S2', 'R1', 'R2'
      )
    );

comment on column public.learner_profiles.course_code is
  'Stable Mattis course key mapped to the current Udir curriculum catalogue.';
