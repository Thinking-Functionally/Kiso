
(deftest map-with-many-collections
  (is (= [9 12] (vec (map + [1 2] [3 4] [5 6]))))
  (is (= [[1 3] [2 4]] (vec (apply map vector [[1 2] [3 4]]))))
  (is (= [[1 4 7] [2 5 8] [3 6 9]] (vec (apply map vector [[1 2 3] [4 5 6] [7 8 9]]))))
  (is (= [111 222] (vec (map + [1 2] [10 20] [100 200]))))
  (is (= [10] (vec (map + [1 2] [3 4] [5 6] [1] )))))
