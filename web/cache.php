<?php

$url = 'http://www.flashsilver.com/';

$request = curl_init($url);
curl_setopt($request, CURLOPT_RETURNTRANSFER, true);
curl_setopt($request, CURLOPT_HEADER, false);
curl_setopt($request, CURLOPT_TIMEOUT, 30000);

$content = @curl_exec($request);

echo $content;

